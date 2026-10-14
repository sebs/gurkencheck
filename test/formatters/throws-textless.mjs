// A formatter that throws something that cannot be turned into text.
export default function throwsTextless() {
  throw Object.create(null);
}
