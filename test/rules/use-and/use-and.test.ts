import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseFeature} from '../../../src/gherkin/parse.ts';
import {newRunContext} from '../../../src/rules.ts';
import rule from '../../../src/rules/use-and.ts';
import {checkRule} from '../../helpers.ts';

const shouldUseAnd = (keyword: string, text: string, line: number) => ({
  message: `Step "${keyword}${text}" should use And instead of ${keyword.trim()}`,
  line,
});

test('accepts repeated steps written with And', async () => {
  await checkRule(rule, 'use-and/NoViolations.feature', {}, []);
});

test('reports a keyword repeated instead of And', async () => {
  await checkRule(rule, 'use-and/Violations.feature', {}, [
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

test('takes a * step as carrying on, like And', async () => {
  await checkRule(rule, 'use-and/StarSteps.feature', {}, []);
});

test('suggests the word for And in the file s own language', async () => {
  const {feature, file} = parseFeature(
    'de.feature',
    '# language: de\nFunktionalität: A\n  Szenario: B\n    Angenommen x\n    Angenommen y\n',
  );
  const errors = await rule.run(feature, file, undefined, newRunContext());
  assert.deepEqual(
    errors.map((error) => error.message),
    ['Step "Angenommen y" should use Und instead of Angenommen'],
  );
});

test('suggests the plain word for And where a dialect has several', async () => {
  const {feature, file} = parseFeature('fr.feature', '# language: fr\nFonctionnalité: A\n  Scénario: B\n    Soit x\n    Soit y\n');
  const errors = await rule.run(feature, file, undefined, newRunContext());
  assert.deepEqual(errors.map((error) => error.message), ['Step "Soit y" should use Et instead of Soit']);
});
