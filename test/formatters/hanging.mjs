// A formatter whose promise never settles.
export default function hanging() {
  return new Promise(() => {});
}
