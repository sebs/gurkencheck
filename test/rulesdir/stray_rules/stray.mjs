// A rule that leaves a promise to reject with nobody waiting for it.
export default {
  name: 'stray',
  run() {
    Promise.reject(new Error('nobody was waiting'));
    return [];
  },
};
