import {test} from 'node:test';
import rule from '../../../src/rules/no-duplicate-tags.ts';
import {checkRule} from '../../helpers.ts';

const duplicate = (tag: string, line: number) => ({
  message: `Duplicate tags are not allowed: ${tag}`,
  line,
});

test('accepts a file where every tag appears once per node', () => {
  checkRule(rule, 'no-duplicate-tags/NoViolations.feature', {}, []);
});

test('reports repeated tags on features, scenarios, outlines and examples', () => {
  checkRule(rule, 'no-duplicate-tags/Violations.feature', {}, [
    duplicate('@featuretag', 1),
    // @scenariotag appears three times on line 7: two repeats, two errors.
    duplicate('@scenariotag', 7),
    duplicate('@scenariotag', 7),
    duplicate('@scenariooutlinetag', 11),
    duplicate('@examplestag', 14),
  ]);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/173
test('reports every repeat, so three copies of a tag are two errors', () => {
  checkRule(rule, 'no-duplicate-tags/RepeatedThreeTimes.feature', {}, [
    duplicate('@bar', 3),
    duplicate('@bar', 3),
  ]);
});
