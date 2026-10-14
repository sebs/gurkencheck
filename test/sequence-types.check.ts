// Type checks only, run by npm run typecheck: what lint() will and will not take.
import {lint} from '../src/linter.ts';
async function* gen(): AsyncGenerator<string> { yield 'a'; }
declare const rules: Parameters<typeof lint>[2];
void lint(['a.feature'], {}, rules);
void lint(gen(), {}, rules);
void lint(new Set(['a']), {}, rules);
// @ts-expect-error a string is not a list of files
void lint('a.feature', {}, rules);
