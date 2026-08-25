// A custom rule written as CommonJS, to prove `module.exports` still works.
const name = 'custom';

module.exports = {
  name,
  availableConfigs: [],
  run() {
    return [{message: 'Custom error', rule: name, line: 123}];
  },
};
