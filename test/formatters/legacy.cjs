// A formatter written as CommonJS, exporting printResults as the old ones did.
module.exports.printResults = function printResults(results) {
  console.log(`legacy formatter saw ${results.length} files`);
};
