/** A streaming formatter whose hooks are async. */
export function startRun() {
  return {
    start: async () => 'start',
    file: async (result) => `|${result.filePath.split('/').pop()}`,
    end: async () => '|end\n',
  };
}
