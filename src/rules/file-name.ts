import path from 'node:path';
import type {LintRule} from '../types.ts';
import {camelCase, kebabCase, pascalCase, snakeCase, titleCase} from '../util/case.ts';
import {mergeDefaults} from '../util/collections.ts';

const name = 'file-name';

const STYLES = {
  PascalCase: pascalCase,
  'Title Case': titleCase,
  camelCase,
  'kebab-case': kebabCase,
  snake_case: snakeCase,
};

type Style = keyof typeof STYLES;

const availableConfigs = {
  /** One of PascalCase, Title Case, camelCase, kebab-case or snake_case. */
  style: 'PascalCase' as Style,
};

const rule: LintRule = {
  name,
  availableConfigs,
  run(_feature, file, configuration) {
    const {style} = mergeDefaults(availableConfigs, configuration);
    const convert = STYLES[style];
    if (convert === undefined) {
      throw new Error(
        `style "${style}" is not supported by the ${name} rule. ` +
          `Supported styles: ${Object.keys(STYLES).join(', ')}`,
      );
    }

    const fileName = path.basename(file.relativePath, '.feature');
    const expected = convert(fileName);
    if (fileName === expected) {
      return [];
    }
    return [
      {
        message: `File names should be written in ${style} e.g. "${expected}.feature"`,
        rule: name,
        line: 0,
      },
    ];
  },
};

export default rule;
