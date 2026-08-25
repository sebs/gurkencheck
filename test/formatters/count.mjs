// A formatter that returns its output rather than printing it.
export default function count(results) {
  const total = results.reduce((sum, result) => sum + result.errors.length, 0);
  return `${total} findings in ${results.length} files`;
}
