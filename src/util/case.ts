/**
 * Word splitting and case conversion, as used by the `file-name` rule.
 * Replaces lodash's `startCase`/`camelCase`/`kebabCase`/`snakeCase`.
 */

/**
 * Splits an identifier into words, breaking on separators, on lower-to-upper
 * transitions and between a run of capitals and a following capitalised word
 * (so `XMLHttpRequest` becomes `XML`, `Http`, `Request`).
 */
export function words(value: string): string[] {
  return value.match(/[A-Z]{2,}(?=[A-Z][a-z]+\d*|\b)|[A-Z]?[a-z]+\d*|[A-Z]+\d*|\d+/g) ?? [];
}

function upperFirst(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** `my fancy feature` -> `My Fancy Feature` */
export function titleCase(value: string): string {
  return words(value).map(upperFirst).join(' ');
}

/** `my fancy feature` -> `MyFancyFeature` */
export function pascalCase(value: string): string {
  return words(value).map(upperFirst).join('');
}

/** `my fancy feature` -> `myFancyFeature` */
export function camelCase(value: string): string {
  return words(value)
    .map((word, index) => (index === 0 ? word.toLowerCase() : upperFirst(word.toLowerCase())))
    .join('');
}

/** `my fancy feature` -> `my-fancy-feature` */
export function kebabCase(value: string): string {
  return words(value)
    .map((word) => word.toLowerCase())
    .join('-');
}

/** `my fancy feature` -> `my_fancy_feature` */
export function snakeCase(value: string): string {
  return words(value)
    .map((word) => word.toLowerCase())
    .join('_');
}
