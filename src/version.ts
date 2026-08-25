/**
 * The package version, read from package.json at run time.
 *
 * This file sits one directory below package.json both in the sources and in
 * the compiled output, so the same relative path works either way.
 */
import fs from 'node:fs';
import path from 'node:path';

let cached: string | undefined;

/** The version from package.json, or `0.0.0` if it cannot be read. */
export function version(): string {
  if (cached === undefined) {
    try {
      const packagePath = path.join(import.meta.dirname, '..', 'package.json');
      const contents = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {version?: string};
      cached = contents.version ?? '0.0.0';
    } catch {
      cached = '0.0.0';
    }
  }
  return cached;
}
