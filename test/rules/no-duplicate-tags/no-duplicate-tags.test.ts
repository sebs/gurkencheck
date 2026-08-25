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
    duplicate('@scenariotag', 7),
    duplicate('@scenariooutlinetag', 11),
    duplicate('@examplestag', 14),
  ]);
});
