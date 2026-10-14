// A rule whose promise never settles.
export default {
  name: 'hang',
  run() {
    return new Promise(() => {});
  },
};
