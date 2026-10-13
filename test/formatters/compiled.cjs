// What tsc or Babel make of `export default function` when compiling to CommonJS.
'use strict';
Object.defineProperty(exports, '__esModule', {value: true});
exports.default = function count(results) {
  return `compiled formatter saw ${results.length} files`;
};
