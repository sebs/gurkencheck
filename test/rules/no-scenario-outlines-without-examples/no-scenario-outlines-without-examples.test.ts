import {test} from 'node:test';
import rule from '../../../src/rules/no-scenario-outlines-without-examples.ts';
import {checkRule} from '../../helpers.ts';

const message = 'Scenario Outline does not have any Examples';

test('accepts an outline with examples', () => {
  checkRule(rule, 'no-scenario-outlines-without-examples/NoViolations.feature', {}, []);
});

for (const fixture of ['ViolationsNoExamples', 'ViolationsEmptyExamples', 'ViolationsNoExamplesBody']) {
  test(`reports ${fixture}`, () => {
    checkRule(rule, `no-scenario-outlines-without-examples/${fixture}.feature`, {}, [
      {message, line: 3},
    ]);
  });
}
