// A streaming formatter that takes the rules it is handed apart.
export function startRun(context) {
  context.rules.clear();
  return {file: () => ''};
}
