/**
 * Ready-made configurations.
 *
 * `recommended` is what you get when there is no configuration file. It holds
 * the rules that catch a mistake rather than express a preference: an empty
 * file, a scenario with no name, a variable that will never be substituted.
 * Nothing in it depends on how a team likes to lay a file out, so it should be
 * quiet on a codebase that has never been linted.
 *
 * Rules about style - indentation, name length, which tags go where, whether
 * repeated keywords become And - are deliberately left out. They are worth
 * switching on, but that is a decision for a team to make rather than a
 * default to inherit.
 */
import type {Configuration} from './types.ts';

export const RECOMMENDED: Configuration = {
  'new-line-at-eof': ['on', 'yes'],
  'no-dupe-feature-names': 'on',
  'no-dupe-scenario-names': 'on',
  'no-duplicate-tags': 'on',
  'no-empty-background': 'on',
  'no-empty-file': 'on',
  'no-examples-in-scenarios': 'on',
  'no-files-without-scenarios': 'on',
  'no-multiple-empty-lines': 'on',
  'no-partially-commented-tag-lines': 'on',
  'no-scenario-outlines-without-examples': 'on',
  'no-trailing-spaces': 'on',
  'no-undeclared-variables': 'on',
  'no-unnamed-features': 'on',
  'no-unnamed-scenarios': 'on',
  'no-unused-variables': 'on',
  'one-space-between-tags': 'on',
};

/** The presets that can be named in a configuration file. */
export const PRESETS: Record<string, Configuration> = {
  'gurkencheck:recommended': RECOMMENDED,
};
