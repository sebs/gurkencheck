import assert from 'node:assert/strict';
import {test} from 'node:test';
import rule from '../../../src/rules/file-name.ts';
import {checkRule, runRule} from '../../helpers.ts';

const FIXTURES = {
  PascalCase: 'PascalCaseWithFiveWords',
  'Title Case': 'Title Case',
  camelCase: 'camelCase',
  'kebab-case': 'kebab-case',
  snake_case: 'snake_case',
};

/** What each fixture's name should look like once converted to each style. */
const EXPECTED: Record<string, Record<string, string>> = {
  'kebab-case': {
    PascalCase: 'pascal-case-with-five-words',
    'Title Case': 'title-case',
    camelCase: 'camel-case',
    snake_case: 'snake-case',
  },
  camelCase: {
    PascalCase: 'pascalCaseWithFiveWords',
    'Title Case': 'titleCase',
    'kebab-case': 'kebabCase',
    snake_case: 'snakeCase',
  },
  PascalCase: {
    'Title Case': 'TitleCase',
    camelCase: 'CamelCase',
    'kebab-case': 'KebabCase',
    snake_case: 'SnakeCase',
  },
  'Title Case': {
    PascalCase: 'Pascal Case With Five Words',
    camelCase: 'Camel Case',
    'kebab-case': 'Kebab Case',
    snake_case: 'Snake Case',
  },
  snake_case: {
    PascalCase: 'pascal_case_with_five_words',
    'Title Case': 'title_case',
    camelCase: 'camel_case',
    'kebab-case': 'kebab_case',
  },
};

for (const [style, fixture] of Object.entries(FIXTURES)) {
  test(`accepts a file already written in ${style}`, async () => {
    await checkRule(rule, `file-name/${fixture}.feature`, {style}, []);
  });
}

for (const [style, cases] of Object.entries(EXPECTED)) {
  for (const [fixtureStyle, corrected] of Object.entries(cases)) {
    test(`reports a ${fixtureStyle} file name when ${style} is required`, async () => {
      await checkRule(rule, `file-name/${FIXTURES[fixtureStyle as keyof typeof FIXTURES]}.feature`, {style}, [
        {
          message: `File names should be written in ${style} e.g. "${corrected}.feature"`,
          line: 0,
        },
      ]);
    });
  }
}

test('rejects a style it does not know', async () => {
  assert.throws(
    () => runRule(rule, 'file-name/camelCase.feature', {style: 'SHOUTING'}),
    /style "SHOUTING" is not supported by the file-name rule/u,
  );
});
