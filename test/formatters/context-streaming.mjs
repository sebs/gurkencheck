/** A streaming formatter that says how many rules the run had. */
export function startRun(context) {
  return {file: () => '', end: () => `rules: ${context?.rules?.size ?? 'none'}\n`};
}
