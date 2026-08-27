/**
 * The documentation for every rule.
 *
 * A test checks that this list matches the rules that actually exist, so a
 * new rule cannot be added without documenting it.
 */
import type {RuleDoc} from './types.ts';

export const RULE_DOCS: RuleDoc[] = [
  {
    name: 'allowed-tags',
    summary: 'Only lets you use tags from a list you decide on.',
    explanation:
      'Teams often agree on a small set of tags. Once you write that set down here, a ' +
      'mistyped or made-up tag is caught straight away instead of quietly doing nothing.',
    settings: [
      {
        name: 'tags',
        type: 'list of tag names',
        fallback: 'empty list',
        description: 'Tags that are allowed, written exactly as they appear in the file.',
      },
      {
        name: 'patterns',
        type: 'list of regular expressions',
        fallback: 'empty list',
        description: 'A tag is allowed when it matches any of these. Use this for tags with numbers in them, such as ticket references.',
      },
    ],
    config: '{\n  "allowed-tags": ["on", {\n    "tags": ["@wip", "@smoke"],\n    "patterns": ["^@issue-\\\\d+$"]\n  }]\n}',
    good: '@smoke @issue-42\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    When I log in\n    Then I see my dashboard',
    bad: '@smoek\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    When I log in\n    Then I see my dashboard',
    message: 'Not allowed tag @smoek on Feature',
  },
  {
    name: 'background-setup-only',
    summary: 'Keeps a Background to setting things up.',
    explanation:
      'A Background runs before every scenario in the file, so an action or a check written ' +
      'there happens over and over, out of sight of the scenario it belongs to. Anything that ' +
      'is not setup belongs in the scenarios themselves. An And or a But counts as whatever ' +
      'keyword it carries on from, so a step following a When is reported too.',
    config: '{\n  "background-setup-only": "on"\n}',
    good: 'Feature: Logging in\n\n  Background:\n    Given I am a known user\n    And the network is up\n\n  Scenario: Logging in\n    When I log in\n    Then I see my dashboard\n\n  Scenario: Logging out\n    When I log out\n    Then I see the front page',
    bad: 'Feature: Logging in\n\n  Background:\n    Given I am a known user\n    When I log in\n\n  Scenario: A dashboard is shown\n    Then I see my dashboard\n\n  Scenario: Logging out is offered\n    Then I can log out',
    message: 'Step "When I log in" is not a setup step, and a Background only sets things up',
  },
  {
    name: 'file-name',
    summary: 'Keeps every feature file named in the same style.',
    explanation:
      'Mixed file naming makes a folder hard to scan. Pick one style and this rule tells ' +
      'you the exact name to rename a file to.',
    settings: [
      {
        name: 'style',
        type: 'one of PascalCase, Title Case, camelCase, kebab-case, snake_case',
        fallback: 'PascalCase',
        description: 'The naming style every feature file has to follow.',
      },
    ],
    config: '{\n  "file-name": ["on", {"style": "kebab-case"}]\n}',
    good: '# File: logging-in.feature\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: '# File: LoggingIn.feature\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    message: 'File names should be written in kebab-case e.g. "logging-in.feature"',
  },
  {
    name: 'indentation',
    summary: 'Checks how far each line is indented.',
    explanation:
      'Even indentation makes a feature file readable at a glance. You can set a number ' +
      'for each kind of line. Anything you leave out keeps its default. Tags follow the ' +
      'node they sit above, and a doc string follows its step, one level further in. ' +
      'Set character to space or tab if your team keeps mixing the two.',
    settings: [
      {name: 'Feature', type: 'number of spaces', fallback: '0', description: 'Indentation of the Feature line.'},
      {name: 'Rule', type: 'number of spaces', fallback: '0', description: 'Indentation of a Rule line.'},
      {name: 'Background', type: 'number of spaces', fallback: '0', description: 'Indentation of a Background line.'},
      {name: 'Scenario', type: 'number of spaces', fallback: '0', description: 'Indentation of a Scenario or Scenario Outline line.'},
      {name: 'Step', type: 'number of spaces', fallback: '2', description: 'Indentation of every step, unless you set that keyword on its own.'},
      {name: 'Examples', type: 'number of spaces', fallback: '0', description: 'Indentation of an Examples line.'},
      {name: 'example', type: 'number of spaces', fallback: '2', description: 'Indentation of each row in an Examples table.'},
      {name: 'given', type: 'number of spaces', fallback: 'the Step setting', description: 'Indentation of Given steps only.'},
      {name: 'when', type: 'number of spaces', fallback: 'the Step setting', description: 'Indentation of When steps only.'},
      {name: 'then', type: 'number of spaces', fallback: 'the Step setting', description: 'Indentation of Then steps only.'},
      {name: 'and', type: 'number of spaces', fallback: 'the Step setting', description: 'Indentation of And steps only.'},
      {name: 'but', type: 'number of spaces', fallback: 'the Step setting', description: 'Indentation of But steps only.'},
      {name: 'feature tag', type: 'number of spaces', fallback: 'the Feature setting', description: 'Indentation of tags above the Feature.'},
      {name: 'rule tag', type: 'number of spaces', fallback: 'the Rule setting', description: 'Indentation of tags above a Rule.'},
      {name: 'scenario tag', type: 'number of spaces', fallback: 'the Scenario setting', description: 'Indentation of tags above a Scenario.'},
      {name: 'docstring', type: 'number of spaces', fallback: 'the Step setting plus 2', description: 'Indentation of the """ or ``` line that opens a doc string under a step.'},
      {name: 'character', type: 'one of any, space or tab', fallback: 'any', description: 'Which character indentation has to be made of. Leave it at any to accept either.'},
    ],
    config: '{\n  "indentation": ["on", {\n    "Feature": 0,\n    "Scenario": 2,\n    "Step": 4\n  }]\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    When I log in\n    Then I see my dashboard',
    bad: 'Feature: Logging in\n\n      Scenario: A known user logs in\n  Given I am a known user\n    When I log in\n    Then I see my dashboard',
    message: 'Wrong indentation for "Scenario", expected indentation level of 2, but got 6',
  },
  {
    name: 'keywords-in-logical-order',
    summary: 'Keeps Given, When and Then in that order.',
    explanation:
      'A scenario reads as a small story: first the situation (Given), then the action ' +
      '(When), then the result (Then). Going backwards usually means two scenarios have ' +
      'been squashed into one.',
    config: '{\n  "keywords-in-logical-order": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    When I log in\n    Then I see my dashboard',
    bad: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    Then I see my dashboard\n    When I log in',
    message: 'Step "When I log in" should not appear after step using keyword then',
  },
  {
    name: 'max-scenarios-per-file',
    summary: 'Limits how many scenarios one file may hold.',
    explanation:
      'A file with dozens of scenarios is hard to work with. This rule nudges you to ' +
      'split it into smaller files, each about one thing.',
    settings: [
      {
        name: 'maxScenarios',
        type: 'number',
        fallback: '10',
        description: 'How many scenarios a single file may contain.',
      },
      {
        name: 'countOutlineExamples',
        type: 'true or false',
        fallback: 'true',
        description: 'When true, every row of an Examples table counts as its own scenario, because that is how many times it will run.',
      },
    ],
    config: '{\n  "max-scenarios-per-file": ["on", {\n    "maxScenarios": 10,\n    "countOutlineExamples": true\n  }]\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n\n  Scenario: An unknown user is turned away\n    Given I am not a known user',
    bad: '# The same file, but with 11 scenarios in it.\nFeature: Everything about accounts\n\n  Scenario: Logging in\n    Given I am a known user\n\n  # ... nine more scenarios ...\n\n  Scenario: Deleting an account\n    Given I am a known user',
    message: 'Number of scenarios exceeds maximum: 11/10',
  },
  {
    name: 'name-length',
    summary: 'Stops names and steps from growing too long.',
    explanation:
      'A very long name is usually a sign that too much is being described at once. ' +
      'You can set a separate limit for each kind of name, and set any of them to 0 to ' +
      'stop checking that kind. Steps are often the one people want to leave alone.',
    settings: [
      {name: 'Feature', type: 'number of characters, or 0 for no limit', fallback: '70', description: 'Longest allowed Feature name.'},
      {name: 'Rule', type: 'number of characters, or 0 for no limit', fallback: '70', description: 'Longest allowed Rule name.'},
      {name: 'Scenario', type: 'number of characters, or 0 for no limit', fallback: '70', description: 'Longest allowed Scenario name.'},
      {name: 'Step', type: 'number of characters, or 0 for no limit', fallback: '70', description: 'Longest allowed step text. Set to 0 to stop checking step length.'},
    ],
    config: '{\n  "name-length": ["on", {\n    "Feature": 70,\n    "Scenario": 70,\n    "Step": 0\n  }]\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: 'Feature: Logging in\n\n  Scenario: A known user who has already confirmed their email address and accepted the terms logs in\n    Given I am a known user',
    message: 'Scenario name is too long. Length of 95 is longer than the maximum allowed: 70',
  },
  {
    name: 'new-line-at-eof',
    summary: 'Requires, or forbids, an empty line at the end of the file.',
    explanation:
      'Most tools expect a file to end with a line break. Pick "yes" to require one, or ' +
      '"no" to forbid one, and every file in the project will match.',
    settings: [
      {
        name: 'the value',
        type: '"yes" or "no"',
        fallback: '"yes"',
        description: 'Whether the file must end with a line break ("yes") or must not ("no"). This rule takes a single value rather than an object.',
      },
    ],
    config: '{\n  "new-line-at-eof": ["on", "yes"]\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n↵ <- the file ends with a line break',
    bad: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user <- the file stops here, with no line break',
    message: 'New line at EOF(end of file) is required',
  },
  {
    name: 'no-background-only-scenario',
    summary: 'Drops a Background that only one scenario uses.',
    explanation:
      'A Background exists to share setup between scenarios. With only one scenario in ' +
      'the file there is nothing to share, and the steps read better inside the scenario. ' +
      'A Background inside a Rule is judged against that Rule\'s scenarios. A Background ' +
      'with no scenarios at all is left to no-files-without-scenarios to report.',
    config: '{\n  "no-background-only-scenario": "on"\n}',
    good: 'Feature: Logging in\n\n  Background:\n    Given I am a known user\n\n  Scenario: Logging in works\n    When I log in\n    Then I see my dashboard\n\n  Scenario: Logging out works\n    When I log out\n    Then I see the front page',
    bad: 'Feature: Logging in\n\n  Background:\n    Given I am a known user\n\n  Scenario: Logging in works\n    When I log in\n    Then I see my dashboard',
    message: 'Backgrounds are not allowed when there is just one scenario.',
  },
  {
    name: 'no-dupe-feature-names',
    summary: 'Makes sure no two features share a name.',
    explanation:
      'Two features with the same name are hard to tell apart in a test report. The ' +
      'message names the other file so you can decide which one to rename.',
    config: '{\n  "no-dupe-feature-names": "on"\n}',
    good: '# LoggingIn.feature\nFeature: Logging in\n\n# LoggingOut.feature\nFeature: Logging out',
    bad: '# LoggingIn.feature\nFeature: Logging in\n\n# LoggingInAgain.feature\nFeature: Logging in',
    message: 'Feature name is already used in: LoggingIn.feature',
  },
  {
    name: 'no-dupe-file-names',
    summary: 'No two feature files may share a name.',
    explanation:
      'Two files called the same thing in different folders are easy to mix up in a ' +
      'review or a stack trace. Worse, tools that write one report per feature name it ' +
      'after the file, so one run quietly overwrites the other and you lose a result ' +
      'without being told. Only the name is compared, not the folder.',
    config: '{\n  "no-dupe-file-names": "on"\n}',
    good: 'features/accounts/Login.feature\nfeatures/admin/AdminLogin.feature',
    bad: 'features/accounts/Login.feature\nfeatures/admin/Login.feature',
    message: 'File name is already used in: features/accounts/Login.feature',
  },
  {
    name: 'no-dupe-scenario-names',
    summary: 'Makes sure no two scenarios share a name.',
    explanation:
      'Scenario names show up in reports. When two are identical you cannot tell which ' +
      'one failed. You can look for duplicates across the whole project, or only inside ' +
      'each file.',
    settings: [
      {
        name: 'the value',
        type: '"anywhere" or "in-feature"',
        fallback: '"anywhere"',
        description: '"anywhere" compares every scenario in the project. "in-feature" only compares scenarios within the same file. This rule takes a single value rather than an object.',
      },
    ],
    config: '{\n  "no-dupe-scenario-names": ["on", "anywhere"]\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n\n  Scenario: An unknown user is turned away\n    Given I am not a known user',
    bad: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n\n  Scenario: A known user logs in\n    Given I am a known user on a phone',
    message: 'Scenario name is already used in: LoggingIn.feature:3',
  },
  {
    name: 'no-duplicate-tags',
    summary: 'Stops the same tag being written twice in one place.',
    explanation:
      'Repeating a tag has no effect and is nearly always a copy-and-paste slip.',
    config: '{\n  "no-duplicate-tags": "on"\n}',
    good: '@smoke @slow\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: '@smoke @slow @smoke\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    message: 'Duplicate tags are not allowed: @smoke',
  },
  {
    name: 'no-empty-background',
    summary: 'Removes a Background with no steps in it.',
    explanation: 'An empty Background does nothing. It is usually left behind after a tidy-up.',
    config: '{\n  "no-empty-background": "on"\n}',
    good: 'Feature: Logging in\n\n  Background:\n    Given I am a known user\n\n  Scenario: Logging in works\n    When I log in\n\n  Scenario: Logging out works\n    When I log out',
    bad: 'Feature: Logging in\n\n  Background:\n\n  Scenario: Logging in works\n    When I log in\n\n  Scenario: Logging out works\n    When I log out',
    message: 'Empty backgrounds are not allowed.',
  },
  {
    name: 'no-empty-file',
    summary: 'Flags feature files with nothing in them.',
    explanation:
      'An empty file is either a leftover or a file someone forgot to finish. Either ' +
      'way it is worth knowing about.',
    config: '{\n  "no-empty-file": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: '# An empty file, or one holding only spaces and blank lines.',
    message: 'Empty feature files are disallowed',
  },
  {
    name: 'no-examples-in-scenarios',
    summary: 'Reminds you that Examples belong to a Scenario Outline.',
    explanation:
      'An Examples table only runs when it hangs off a Scenario Outline. Attached to a ' +
      'plain Scenario it is silently ignored, so your test never runs the rows you wrote.',
    config: '{\n  "no-examples-in-scenarios": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario Outline: Logging in as <role>\n    Given I am a <role>\n    When I log in\n\n    Examples:\n      | role  |\n      | admin |\n      | guest |',
    bad: 'Feature: Logging in\n\n  Scenario: Logging in as <role>\n    Given I am a <role>\n    When I log in\n\n    Examples:\n      | role  |\n      | admin |\n      | guest |',
    message: 'Cannot use "Examples" in a "Scenario", use a "Scenario Outline" instead',
  },
  {
    name: 'no-files-without-scenarios',
    summary: 'Flags a feature file that never tests anything.',
    explanation:
      'A Feature with no Scenario runs no tests. It is usually a file someone started ' +
      'and did not come back to.',
    config: '{\n  "no-files-without-scenarios": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: 'Feature: Logging in\n\n  A description of what we plan to test one day.',
    message: 'Feature file does not have any Scenarios',
  },
  {
    name: 'no-homogenous-tags',
    summary: 'Moves a tag up when every scenario carries it.',
    explanation:
      'When every scenario in a file has the same tag, that tag really belongs to the ' +
      'Feature. Writing it once at the top is shorter and stays correct when you add a ' +
      'new scenario. The same goes for a tag repeated on every Examples table of a ' +
      'Scenario Outline. You get one error per tag. A feature with only one scenario is ' +
      'left alone: its single scenario shares nothing with anything, and a tag that ' +
      'identifies that one scenario would be wrong on the Feature.',
    config: '{\n  "no-homogenous-tags": "on"\n}',
    good: '@smoke\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n\n  Scenario: An unknown user is turned away\n    Given I am not a known user',
    bad: 'Feature: Logging in\n\n  @smoke\n  Scenario: A known user logs in\n    Given I am a known user\n\n  @smoke\n  Scenario: An unknown user is turned away\n    Given I am not a known user',
    message: 'Every Scenario on this Feature has the tag @smoke, it should be defined on the Feature instead',
  },
  {
    name: 'no-multiple-empty-lines',
    summary: 'Limits how many blank lines may sit next to each other.',
    explanation:
      'One blank line separates things. Several in a row just add scrolling. If your team ' +
      'likes a wider gap between scenarios, raise the limit rather than switching the rule ' +
      'off. Blank lines inside a doc string are left alone, because they are part of the ' +
      'text being quoted.',
    settings: [
      {
        name: 'max',
        type: 'number of lines',
        fallback: '1',
        description: 'How many blank lines may sit next to each other. Each blank line past this is reported.',
      },
    ],
    config: '{\n  "no-multiple-empty-lines": ["on", {"max": 2}]\n}',
    good: '# With "max" left at 1:\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: '# With "max" left at 1:\nFeature: Logging in\n\n\n\n  Scenario: A known user logs in\n    Given I am a known user',
    message: 'Multiple empty lines are not allowed',
  },
  {
    name: 'no-partially-commented-tag-lines',
    summary: 'Catches a "#" part way along a line of tags.',
    explanation:
      'A "#" comments out the rest of the line. On a tag line that quietly switches off ' +
      'every tag after it, which is easy to miss when reading the file.',
    config: '{\n  "no-partially-commented-tag-lines": "on"\n}',
    good: '# only run this in the nightly build\n@smoke @slow\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: '@smoke # @slow\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    message: 'Partially commented tag lines not allowed',
  },
  {
    name: 'no-restricted-patterns',
    summary: 'Bans wording you do not want in your feature files.',
    explanation:
      'Some words creep into feature files and make them worse: leftover debugging steps, ' +
      'or vague verbs like "verify" that hide what is really being checked. List them ' +
      'here and they will be caught. Matching ignores upper and lower case.',
    settings: [
      {name: 'Global', type: 'list of regular expressions', fallback: 'empty list', description: 'Applied everywhere, on top of the lists below.'},
      {name: 'Feature', type: 'list of regular expressions', fallback: 'empty list', description: 'Applied to the Feature name and description.'},
      {name: 'Rule', type: 'list of regular expressions', fallback: 'empty list', description: 'Applied to a Rule name and description.'},
      {name: 'Background', type: 'list of regular expressions', fallback: 'empty list', description: 'Applied to a Background description and its steps.'},
      {name: 'Scenario', type: 'list of regular expressions', fallback: 'empty list', description: 'Applied to a Scenario name, description and steps.'},
      {name: 'ScenarioOutline', type: 'list of regular expressions', fallback: 'empty list', description: 'Applied to a Scenario Outline name, description and steps.'},
    ],
    config: '{\n  "no-restricted-patterns": ["on", {\n    "Global": ["^prints the last response"],\n    "Feature": ["verify", "validate"]\n  }]\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    When I log in\n    Then I see my dashboard',
    bad: 'Feature: Verify logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    When I log in\n    Then prints the last response',
    message: 'Feature name: "Verify logging in" matches restricted pattern "/verify/i"',
  },
  {
    name: 'no-restricted-tags',
    summary: 'Bans tags you do not want committed.',
    explanation:
      'Tags such as @wip or @only are handy while you work and harmful once merged. ' +
      'List them here and nobody can commit them by accident.',
    settings: [
      {name: 'tags', type: 'list of tag names', fallback: 'empty list', description: 'Tags that are forbidden, written exactly as they appear.'},
      {name: 'patterns', type: 'list of regular expressions', fallback: 'empty list', description: 'A tag is forbidden when it matches any of these.'},
    ],
    config: '{\n  "no-restricted-tags": ["on", {\n    "tags": ["@wip", "@only"],\n    "patterns": ["^@debug"]\n  }]\n}',
    good: '@smoke\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: '@wip\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    message: 'Forbidden tag @wip on Feature',
  },
  {
    name: 'no-scenario-outlines-without-examples',
    summary: 'Flags a Scenario Outline with no rows to run.',
    explanation:
      'A Scenario Outline is a template. Without an Examples table holding at least one ' +
      'row there is nothing to fill it in with, so the scenario never runs.',
    config: '{\n  "no-scenario-outlines-without-examples": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario Outline: Logging in as <role>\n    Given I am a <role>\n\n    Examples:\n      | role  |\n      | admin |',
    bad: 'Feature: Logging in\n\n  Scenario Outline: Logging in as <role>\n    Given I am a <role>\n\n    Examples:\n      | role |',
    message: 'Scenario Outline does not have any Examples',
  },
  {
    name: 'no-scenarios-without-then',
    summary: 'Every scenario has to check something.',
    explanation:
      'A scenario with no Then step acts without ever saying what should have happened, so it passes for as long as nothing throws - which is not the same as the feature working. Steps in a Background count towards this, ' +
      'because they really do run before the scenario; turn countBackground off if you want ' +
      'every scenario to read on its own instead. An And or a But counts as whatever keyword ' +
      'it carries on from.',
    settings: [
      {
        name: 'countBackground',
        type: 'true or false',
        fallback: 'true',
        description: 'Whether a Then step in a Background counts for the scenarios under it. Set it to false to make each scenario stand on its own.',
      },
    ],
    config: '{\n  "no-scenarios-without-then": ["on", {"countBackground": true}]\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    When I log in\n    Then I see my dashboard',
    bad: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    When I log in',
    message: 'Scenario "A known user logs in" does not have a Then step',
  },
  {
    name: 'no-scenarios-without-when',
    summary: 'Every scenario has to do something.',
    explanation:
      'A scenario with no When step sets the world up and checks it without ever acting on it, which usually means the action was left out, or buried in a Given where a reader will not look for it. Steps in a Background count towards this, ' +
      'because they really do run before the scenario; turn countBackground off if you want ' +
      'every scenario to read on its own instead. An And or a But counts as whatever keyword ' +
      'it carries on from.',
    settings: [
      {
        name: 'countBackground',
        type: 'true or false',
        fallback: 'true',
        description: 'Whether a When step in a Background counts for the scenarios under it. Set it to false to make each scenario stand on its own.',
      },
    ],
    config: '{\n  "no-scenarios-without-when": ["on", {"countBackground": true}]\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    When I log in\n    Then I see my dashboard',
    bad: 'Feature: Logging in\n\n  Scenario: A known user has a dashboard\n    Given I am a known user\n    Then I see my dashboard',
    message: 'Scenario "A known user has a dashboard" does not have a When step',
  },
  {
    name: 'no-superfluous-tags',
    summary: 'Removes a tag repeated from the level above.',
    explanation:
      'A tag on a Feature already applies to everything inside it. Writing it again on a ' +
      'scenario changes nothing and makes the file noisier.',
    config: '{\n  "no-superfluous-tags": "on"\n}',
    good: '@smoke\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n\n  @slow\n  Scenario: An unknown user is turned away\n    Given I am not a known user',
    bad: '@smoke\nFeature: Logging in\n\n  @smoke\n  Scenario: A known user logs in\n    Given I am a known user',
    message: 'Tag duplication between Scenario and its corresponding Feature: @smoke',
  },
  {
    name: 'no-trailing-spaces',
    summary: 'Removes spaces and tabs left at the end of a line.',
    explanation:
      'Trailing whitespace is invisible while you type but shows up in every diff. ' +
      'Removing it keeps reviews about the actual change.',
    config: '{\n  "no-trailing-spaces": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: 'Feature: Logging in\n\n  Scenario: A known user logs in   \n    Given I am a known user ',
    message: 'Trailing spaces are not allowed',
  },
  {
    name: 'no-unnamed-features',
    summary: 'Every Feature needs a name.',
    explanation:
      'The Feature name is the title of the file and the heading in your test report. ' +
      'Without one, a failure is hard to place.',
    config: '{\n  "no-unnamed-features": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: 'Feature:\n\n  Scenario: A known user logs in\n    Given I am a known user',
    message: 'Missing Feature name',
  },
  {
    name: 'no-unnamed-scenarios',
    summary: 'Every Scenario needs a name.',
    explanation:
      'The scenario name is what you see when a test fails. Without one you have to open ' +
      'the file to find out what broke.',
    config: '{\n  "no-unnamed-scenarios": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: 'Feature: Logging in\n\n  Scenario:\n    Given I am a known user',
    message: 'Missing Scenario name',
  },
  {
    name: 'no-unused-variables',
    summary: 'Every column of an Examples table should be used by a step.',
    explanation:
      'A column nothing reads is dead weight, and usually the leftover of a rename that ' +
      'was only half finished. Switch on no-undeclared-variables as well to catch the ' +
      'other half: a <placeholder> with no column behind it.',
    config: '{\n  "no-unused-variables": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario Outline: Logging in as <role>\n    Given I am a <role>\n    Then I see <landing>\n\n    Examples:\n      | role  | landing   |\n      | admin | dashboard |',
    bad: 'Feature: Logging in\n\n  Scenario Outline: Logging in as <role>\n    Given I am a <role>\n\n    Examples:\n      | role  | landing   |\n      | admin | dashboard |',
    message: 'Examples table variable "landing" is not used in any step',
  },
  {
    name: 'no-undeclared-variables',
    summary: 'Every <placeholder> in a step needs a column to fill it in.',
    explanation:
      'A placeholder with no matching column is never substituted. The step runs with the ' +
      'angle brackets still in the text, which almost never matches a step definition and ' +
      'is confusing when it does. Usually it is a typo or a column that was renamed.',
    config: '{\n  "no-undeclared-variables": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario Outline: Logging in as <role>\n    Given I am a <role>\n\n    Examples:\n      | role  |\n      | admin |',
    bad: 'Feature: Logging in\n\n  Scenario Outline: Logging in as <role>\n    Given I am a <rol>\n\n    Examples:\n      | role  |\n      | admin |',
    message: 'Step variable "rol" does not exist in the examples table',
  },
  {
    name: 'one-space-between-tags',
    summary: 'One space between tags on the same line.',
    explanation: 'Lining tags up with extra spaces looks tidy until someone renames one.',
    config: '{\n  "one-space-between-tags": "on"\n}',
    good: '@smoke @slow\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: '@smoke     @slow\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    message: 'There is more than one space between the tags @smoke and @slow',
  },
  {
    name: 'only-one-when',
    summary: 'One action per scenario.',
    explanation:
      'A scenario should test one action. Two When steps usually means two scenarios ' +
      'have been joined together, which makes a failure harder to read. By default an ' +
      'And step following a When counts as another When, because it is another action. ' +
      'If your team writes one action across several And steps, turn countAnd off and ' +
      'only real When keywords are counted.',
    settings: [
      {
        name: 'countAnd',
        type: 'true or false',
        fallback: 'true',
        description: 'Whether an And step following a When counts as another When. Set it to false to count only real When keywords.',
      },
    ],
    config: '{\n  "only-one-when": ["on", {"countAnd": true}]\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    When I log in\n    Then I see my dashboard',
    bad: 'Feature: Logging in\n\n  Scenario: A known user logs in and out\n    Given I am a known user\n    When I log in\n    When I log out\n    Then I see the front page',
    message: 'Scenario "A known user logs in and out" contains 2 When statements (max 1)',
  },
  {
    name: 'required-tags',
    summary: 'Requires each scenario to carry certain tags.',
    explanation:
      'Useful when every scenario has to be traceable, for example to a ticket number. ' +
      'Each entry is a pattern, and a scenario must have at least one tag matching it.',
    settings: [
      {
        name: 'tags',
        type: 'list of regular expressions',
        fallback: 'empty list',
        description: 'Each pattern must be matched by at least one tag on the scenario.',
      },
      {
        name: 'ignoreUntagged',
        type: 'true or false',
        fallback: 'true',
        description: 'When true, scenarios with no tags at all are left alone. Set it to false to require tags everywhere.',
      },
    ],
    config: '{\n  "required-tags": ["on", {\n    "tags": ["^@issue-\\\\d+$"],\n    "ignoreUntagged": false\n  }]\n}',
    good: 'Feature: Logging in\n\n  @issue-42\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: 'Feature: Logging in\n\n  @smoke\n  Scenario: A known user logs in\n    Given I am a known user',
    message: 'No tag found matching ^@issue-\\d+$ for Scenario',
  },
  {
    name: 'scenario-size',
    summary: 'Limits how many steps a scenario or background may have.',
    explanation:
      'A long list of steps is usually a sign the scenario has drifted from describing ' +
      'behaviour into describing clicks. Any limit you leave out falls back to 15.',
    settings: [
      {
        name: 'steps-length.Background',
        type: 'number of steps',
        fallback: '15',
        description: 'Longest allowed Background.',
      },
      {
        name: 'steps-length.Scenario',
        type: 'number of steps',
        fallback: '15',
        description: 'Longest allowed Scenario. This applies to Scenario Outlines too.',
      },
    ],
    config: '{\n  "scenario-size": ["on", {\n    "steps-length": {"Background": 5, "Scenario": 10}\n  }]\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    When I log in\n    Then I see my dashboard',
    bad: '# With "Scenario" set to 3:\nFeature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    And I am on the login page\n    When I fill in my name\n    And I fill in my password\n    Then I see my dashboard',
    message: 'Element Scenario too long: actual 5, expected 3',
  },
  {
    name: 'use-and',
    summary: 'Use And instead of repeating a keyword.',
    explanation:
      'Two Givens in a row read like two separate setups. Writing the second as And ' +
      'makes it clear they belong together.',
    config: '{\n  "use-and": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    And I am on the login page\n    When I log in\n    Then I see my dashboard',
    bad: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n    Given I am on the login page\n    When I log in\n    Then I see my dashboard',
    message: 'Step "Given I am on the login page" should use And instead of Given',
  },
  {
    name: 'no-tags-on-backgrounds',
    summary: 'A Background cannot have tags.',
    explanation:
      'A Background runs before every scenario in its Feature, so a tag on it would have ' +
      'no meaning. Gherkin does not allow it, and a file with one cannot be read at all.',
    alwaysOn: true,
    config: '// Always on. Listing it is accepted and does nothing;\n// asking for it to be off is an error.\n{\n  "no-tags-on-backgrounds": "on"\n}',
    good: 'Feature: Logging in\n\n  Background:\n    Given I am a known user\n\n  Scenario: Logging in works\n    When I log in\n\n  Scenario: Logging out works\n    When I log out',
    bad: 'Feature: Logging in\n\n  @setup\n  Background:\n    Given I am a known user\n\n  Scenario: Logging in works\n    When I log in',
    message: 'Tags on Backgrounds are disallowed',
  },
  {
    name: 'one-feature-per-file',
    summary: 'One Feature per file.',
    explanation:
      'Gherkin allows a single Feature in a file. A second one cannot be read, so the ' +
      'whole file fails to parse.',
    alwaysOn: true,
    config: '// Always on. Listing it is accepted and does nothing;\n// asking for it to be off is an error.\n{\n  "one-feature-per-file": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user',
    bad: 'Feature: Logging in\n\n  Scenario: A known user logs in\n    Given I am a known user\n\nFeature: Logging out\n\n  Scenario: A known user logs out\n    Given I am logged in',
    message: 'Multiple "Feature" definitions in the same file are disallowed',
  },
  {
    name: 'up-to-one-background-per-file',
    summary: 'At most one Background per file.',
    explanation:
      'A Background is the shared setup for the whole Feature, so there can only be one ' +
      'of them. A second Background stops the file being read.',
    alwaysOn: true,
    config: '// Always on. Listing it is accepted and does nothing;\n// asking for it to be off is an error.\n{\n  "up-to-one-background-per-file": "on"\n}',
    good: 'Feature: Logging in\n\n  Background:\n    Given I am a known user\n\n  Scenario: Logging in works\n    When I log in\n\n  Scenario: Logging out works\n    When I log out',
    bad: 'Feature: Logging in\n\n  Background:\n    Given I am a known user\n\n  Background:\n    Given I am on the login page\n\n  Scenario: Logging in works\n    When I log in',
    message: 'Multiple "Background" definitions in the same file are disallowed',
  },
  {
    name: 'background-before-scenarios',
    summary: 'A Background has to come before the Scenarios it applies to.',
    explanation:
      'A Background is the shared setup that runs before every Scenario in its Feature, ' +
      'so Gherkin expects it above them. Written underneath, the file cannot be read at ' +
      'all. The fix is to move it to the top, not to delete it.',
    alwaysOn: true,
    config: '// Always on. Listing it is accepted and does nothing;\n// asking for it to be off is an error.\n{\n  "background-before-scenarios": "on"\n}',
    good: 'Feature: Logging in\n\n  Background:\n    Given I am a known user\n\n  Scenario: Logging in works\n    When I log in\n\n  Scenario: Logging out works\n    When I log out',
    bad: 'Feature: Logging in\n\n  Scenario: Logging in works\n    When I log in\n\n  Background:\n    Given I am a known user',
    message: 'A "Background" must come before the Scenarios it applies to',
  },
  {
    name: 'no-multiline-steps',
    summary: 'A step has to fit on one line.',
    explanation:
      'Gherkin reads one step per line. Wrapping a long step onto a second line does not ' +
      'continue it - the parser stops there. If a step needs more text, use a doc string ' +
      'or a data table underneath it.',
    alwaysOn: true,
    config: '// Always on. Listing it is accepted and does nothing;\n// asking for it to be off is an error.\n{\n  "no-multiline-steps": "on"\n}',
    good: 'Feature: Logging in\n\n  Scenario: A known user sees a welcome message\n    Given I am a known user\n    Then I see the message:\n      """\n      Welcome back. You last signed in\n      three days ago.\n      """',
    bad: 'Feature: Logging in\n\n  Scenario: A known user sees a welcome message\n    Given I am a known user\n    Then I see the message Welcome back, you last\n      signed in three days ago',
    message: 'Steps should begin with "Given", "When", "Then", "And" or "But". Multiline steps are disallowed',
  },
];
