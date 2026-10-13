// A default export holding the formatter, rather than being it.
export default {
  printResults(results) {
    return `default object saw ${results.length} files`;
  },
  startRun() {
    return {file: (result) => `${result.filePath}\n`};
  },
};
