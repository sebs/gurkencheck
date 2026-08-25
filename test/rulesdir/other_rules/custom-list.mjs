// A custom rule using a named `rule` export and its own settings.
const name = 'another-custom-list';

export const rule = {
  name,
  availableConfigs: {element: []},
  run() {
    return [{message: 'Another custom-list error', rule: name, line: 109}];
  },
};
