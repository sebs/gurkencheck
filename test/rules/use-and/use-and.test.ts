import {test} from 'node:test';
import rule from '../../../src/rules/use-and.ts';
import {checkRule} from '../../helpers.ts';

const shouldUseAnd = (keyword: string, text: string, line: number) => ({
  message: `Step "${keyword}${text}" should use And instead of ${keyword}`,
  line,
});

test('accepts repeated steps written with And', () => {
  checkRule(rule, 'use-and/NoViolations.feature', {}, []);
});

test('reports a keyword repeated instead of And', () => {
  checkRule(rule, 'use-and/Violations.feature', {}, [
    shouldUseAnd('Given ', 'step5', 5),
    shouldUseAnd('When ', 'step8', 8),
    shouldUseAnd('Then ', 'step11', 11),
    shouldUseAnd('Given ', 'step16', 16),
    shouldUseAnd('When ', 'step19', 19),
    shouldUseAnd('Then ', 'step22', 22),
    shouldUseAnd('Given ', 'step27', 27),
    shouldUseAnd('When ', 'step30', 30),
    shouldUseAnd('Then ', 'step33', 33),
  ]);
});
