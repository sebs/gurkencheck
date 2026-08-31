/** A formatter of one's own that writes as the run goes on. */
export function startRun() {
  return {
    start: () => 'start',
    file: (result) => `|${result.filePath}`,
    end: () => '|end',
  };
}
