// A streaming formatter whose end never comes.
export function startRun() {
  return {file: () => '', end: () => new Promise(() => {})};
}
