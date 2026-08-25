// A custom rule written as an ES module with a default export.
const name = 'another-custom';

export default {
  name,
  availableConfigs: [],
  run() {
    return [{message: 'Another custom error', rule: name, line: 456}];
  },
};
