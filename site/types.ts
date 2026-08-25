/**
 * The shape of the documentation content.
 *
 * The site is generated from plain data so that every rule is documented the
 * same way: what it does, one example that passes and one that fails.
 */

/** One setting a rule accepts. */
export interface SettingDoc {
  /** The key as written in the configuration file. */
  name: string;
  /** The kind of value, described in plain words. */
  type: string;
  /** What you get when you leave it out. */
  fallback: string;
  /** What the setting changes. */
  description: string;
}

/** Everything the site shows about one rule. */
export interface RuleDoc {
  /** The rule name, which is also its page address. */
  name: string;
  /** One line, shown in the rule list. */
  summary: string;
  /** A short explanation in simple language. */
  explanation: string;
  /**
   * Parser rules are always on: the file cannot be read at all when they are
   * broken, so there is nothing to switch off.
   */
  alwaysOn?: boolean;
  /** The settings this rule accepts, if any. */
  settings?: SettingDoc[];
  /** A configuration snippet showing the rule switched on. */
  config: string;
  /** A feature file the rule is happy with. */
  good: string;
  /** A feature file the rule complains about. */
  bad: string;
  /** The message you would see for the bad example. */
  message: string;
}
