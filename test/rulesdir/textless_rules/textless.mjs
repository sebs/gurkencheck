// A rule that throws something that cannot be turned into text.
export default {
  name: 'textless',
  run() {
    throw Object.create(null);
  },
};
