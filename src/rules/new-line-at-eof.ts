import type {LintRule} from '../types.ts';

const name = 'new-line-at-eof';

/** Whether a trailing new line is required (`yes`) or forbidden (`no`). */
const availableConfigs = ['yes', 'no'] as const;

type NewLineSetting = (typeof availableConfigs)[number];

const DEFAULT_SETTING: NewLineSetting = 'yes';

function toSetting(configuration: unknown): NewLineSetting {
  return configuration === 'no' || configuration === 'yes' ? configuration : DEFAULT_SETTING;
}

const rule: LintRule = {
  name,
  availableConfigs,
  run(_feature, file, configuration) {
    const setting = toSetting(configuration);
    // Splitting on line breaks leaves a trailing empty entry when the file
    // ends with one.
    const hasNewLineAtEof = file.lines.at(-1) === '';

    let message = '';
    if (hasNewLineAtEof && setting === 'no') {
      message = 'New line at EOF(end of file) is not allowed';
    } else if (!hasNewLineAtEof && setting === 'yes') {
      message = 'New line at EOF(end of file) is required';
    }

    if (message === '') {
      return [];
    }
    return [{message, rule: name, line: file.lines.length}];
  },
};

export default rule;
