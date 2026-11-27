/**
 * JSON-RPC over a pair of streams, framed the way the Language Server
 * Protocol frames it: a `Content-Length` header, a blank line, then that many
 * bytes of JSON.
 *
 * Both ends of gurkencheck's language server use it - the server over its
 * stdin and stdout, the VS Code extension over the server's - so it knows
 * nothing about either. It is the few pieces of JSON-RPC the protocol uses:
 * requests and their responses, notifications, and errors.
 */
import type {Readable, Writable} from 'node:stream';

/** The error codes JSON-RPC and the protocol define that are used here. */
export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InternalError: -32603,
  ServerNotInitialized: -32002,
  RequestCancelled: -32800,
} as const;

/** An error to answer a request with, carrying a JSON-RPC error code. */
export class ResponseError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

type Id = number | string;

interface Message {
  jsonrpc: '2.0';
  id?: Id | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {code: number; message: string; data?: unknown};
}

export type RequestHandler = (params: unknown) => unknown;
export type NotificationHandler = (params: unknown) => void;

const HEADER_END = Buffer.from('\r\n\r\n', 'ascii');
const CONTENT_LENGTH = /^content-length:\s*(\d+)\s*$/im;

/**
 * Cuts a byte stream into messages. Bytes arrive in pieces that need not
 * line up with the messages - half a header, three messages at once, a
 * character split across two chunks - so the body is only decoded once all
 * of it is there.
 */
class Framer {
  #buffer: Buffer = Buffer.alloc(0);

  /** Takes in a chunk, and hands back every body it completes. */
  push(chunk: Buffer): string[] {
    this.#buffer = this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);
    const bodies: string[] = [];
    for (;;) {
      const end = this.#buffer.indexOf(HEADER_END);
      if (end === -1) {
        return bodies;
      }
      const header = this.#buffer.subarray(0, end).toString('ascii');
      const length = CONTENT_LENGTH.exec(header);
      if (length === null) {
        // A header with no length cannot be read past, as there is no
        // telling where its body ends. Dropping it is all that can be done.
        this.#buffer = this.#buffer.subarray(end + HEADER_END.length);
        continue;
      }
      const start = end + HEADER_END.length;
      const size = Number(length[1]);
      if (this.#buffer.length < start + size) {
        return bodies;
      }
      bodies.push(this.#buffer.subarray(start, start + size).toString('utf8'));
      this.#buffer = this.#buffer.subarray(start + size);
    }
  }
}

/** Turns a message into the bytes that go on the wire. */
export function frame(message: object): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]);
}

/**
 * One end of a JSON-RPC conversation.
 *
 * A request with no handler is answered with MethodNotFound, as the protocol
 * asks; a notification with none is dropped, which is what the protocol asks
 * for those too - a client sends ones a server never heard of all the time.
 */
export class Connection {
  readonly #output: Writable;
  readonly #requests = new Map<string, RequestHandler>();
  readonly #notifications = new Map<string, NotificationHandler>();
  readonly #pending = new Map<Id, {resolve: (value: unknown) => void; reject: (reason: Error) => void}>();
  readonly #closed: Promise<void>;
  #nextId = 1;
  #isClosed = false;
  /** Where to say that something arrived that could not be made sense of. */
  onProblem: (message: string) => void = () => {};

  constructor(input: Readable, output: Writable) {
    this.#output = output;
    const framer = new Framer();
    input.on('data', (chunk: Buffer | string) => {
      for (const body of framer.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk)) {
        this.#receive(body);
      }
    });
    this.#closed = new Promise((resolve) => {
      const close = (): void => {
        if (this.#isClosed) return;
        this.#isClosed = true;
        for (const {reject} of this.#pending.values()) {
          reject(new Error('The connection closed before an answer came'));
        }
        this.#pending.clear();
        resolve();
      };
      input.on('end', close);
      input.on('close', close);
      input.on('error', close);
      // Writing to a process that has gone fails with EPIPE; that is the
      // connection closing, not something to take this process down with.
      output.on('error', close);
    });
  }

  /** Settles once the other end has gone. */
  get closed(): Promise<void> {
    return this.#closed;
  }

  onRequest(method: string, handler: RequestHandler): void {
    this.#requests.set(method, handler);
  }

  onNotification(method: string, handler: NotificationHandler): void {
    this.#notifications.set(method, handler);
  }

  /** Sends a request and settles with its answer. */
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.#isClosed) {
      return Promise.reject(new Error('The connection is closed'));
    }
    const id = this.#nextId++;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, {resolve: resolve as (value: unknown) => void, reject});
      this.#send({jsonrpc: '2.0', id, method, ...(params === undefined ? {} : {params})});
    });
  }

  notify(method: string, params?: unknown): void {
    this.#send({jsonrpc: '2.0', method, ...(params === undefined ? {} : {params})});
  }

  #send(message: Message): void {
    if (this.#isClosed || this.#output.destroyed) {
      return;
    }
    this.#output.write(frame(message));
  }

  #receive(body: string): void {
    let message: Message;
    try {
      message = JSON.parse(body) as Message;
    } catch {
      this.onProblem(`Could not read a message, as it is not JSON: ${body.slice(0, 200)}`);
      this.#send({jsonrpc: '2.0', id: null, error: {code: ErrorCodes.ParseError, message: 'Not JSON'}});
      return;
    }
    if (typeof message !== 'object' || message === null) {
      this.onProblem('Could not read a message, as it is not an object');
      return;
    }

    if (typeof message.method === 'string') {
      if (message.id === undefined || message.id === null) {
        this.#handleNotification(message.method, message.params);
      } else {
        void this.#handleRequest(message.id, message.method, message.params);
      }
      return;
    }

    if (message.id !== undefined && message.id !== null) {
      const waiting = this.#pending.get(message.id);
      if (waiting === undefined) {
        return;
      }
      this.#pending.delete(message.id);
      if (message.error !== undefined) {
        waiting.reject(new ResponseError(message.error.code, message.error.message));
      } else {
        waiting.resolve(message.result ?? null);
      }
    }
  }

  #handleNotification(method: string, params: unknown): void {
    const handler = this.#notifications.get(method);
    if (handler === undefined) {
      return;
    }
    try {
      handler(params);
    } catch (thrown) {
      this.onProblem(`Handling "${method}" failed: ${thrown instanceof Error ? (thrown.stack ?? thrown.message) : String(thrown)}`);
    }
  }

  async #handleRequest(id: Id, method: string, params: unknown): Promise<void> {
    const handler = this.#requests.get(method);
    if (handler === undefined) {
      this.#send({
        jsonrpc: '2.0',
        id,
        error: {code: ErrorCodes.MethodNotFound, message: `Unhandled method ${method}`},
      });
      return;
    }
    try {
      const result = await handler(params);
      this.#send({jsonrpc: '2.0', id, result: result ?? null});
    } catch (thrown) {
      const code = thrown instanceof ResponseError ? thrown.code : ErrorCodes.InternalError;
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      if (!(thrown instanceof ResponseError)) {
        this.onProblem(`Handling "${method}" failed: ${thrown instanceof Error ? (thrown.stack ?? message) : message}`);
      }
      this.#send({jsonrpc: '2.0', id, error: {code, message}});
    }
  }
}
