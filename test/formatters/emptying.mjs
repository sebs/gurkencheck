// A formatter that empties the results as it prints them.
export default function emptying(results) {
  const count = results.reduce((total, result) => total + result.errors.splice(0).length, 0);
  return `${count} findings`;
}
