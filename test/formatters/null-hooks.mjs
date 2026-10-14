/** A streaming formatter whose hooks hand back null for nothing to write. */
export function startRun() {
  return {start: () => null, file: (result) => (result.errors.length > 0 ? 'x\n' : null), end: () => null};
}
