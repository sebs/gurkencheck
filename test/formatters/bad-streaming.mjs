/** A streaming formatter handing back something that is not text. */
export function startRun() {
  return {file: () => 42};
}
