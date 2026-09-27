import type {LintRule} from '../types.ts';
import {contentLines} from '../util/lines.ts';

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
    // An empty file has no line for a new line to end, so there is nothing to
    // require or forbid. Splitting it gives a single empty entry, which would
    // otherwise read as a new line at the end.
    if (file.lines.length === 1 && file.lines[0] === '') {
      return [];
    }
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
    // The last line of the file: the one the new line ends, or the one
    // missing it. contentLines leaves out the empty entry after a new line.
    return [{message, rule: name, line: contentLines(file).length}];
  },
};

export default rule;
