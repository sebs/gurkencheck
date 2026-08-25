/**
 * Helpers for looking at a feature file as plain text.
 */
import type {FeatureFile} from '../types.ts';

/**
 * The lines a person would see in their editor.
 *
 * Splitting on line breaks leaves a trailing empty entry when the file ends
 * with one, which is how `new-line-at-eof` detects that newline. That entry is
 * not a line of the file though, so any rule reporting a line number has to
 * leave it out or it points past the end of the file.
 */
export function contentLines(file: FeatureFile): string[] {
  const {lines} = file;
  return lines.at(-1) === '' ? lines.slice(0, -1) : [...lines];
}
