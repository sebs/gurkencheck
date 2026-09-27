/**
 * Finding an installed package the way `import` would.
 *
 * `createRequire(...).resolve` follows a package's `exports` with the
 * conditions `require` uses, so a package that only exports for `import` - an
 * ES module package, which is what most new ones are - cannot be found by it
 * at all. Node offers no stable way to resolve with the `import` conditions
 * from a directory of your choosing, so when `require` cannot find a package
 * its `exports` are read here instead.
 */
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/** The conditions `import` matches, in the order node tries them. */
const IMPORT_CONDITIONS = new Set(['import', 'node', 'module-sync', 'default']);

/** `@scope/name/sub/path` -> `@scope/name` and `./sub/path`. */
function splitSpecifier(specifier: string): {name: string; subpath: string} {
  const parts = specifier.split('/');
  const length = specifier.startsWith('@') ? 2 : 1;
  const rest = parts.slice(length).join('/');
  return {name: parts.slice(0, length).join('/'), subpath: rest === '' ? '.' : `./${rest}`};
}

/** The target an `exports` value gives for `import`, if it gives one. */
function pickTarget(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const target = pickTarget(entry);
      if (target !== undefined) return target;
    }
    return undefined;
  }
  if (typeof value === 'object' && value !== null) {
    // Conditions are tried in the order the package lists them.
    for (const [condition, nested] of Object.entries(value)) {
      if (IMPORT_CONDITIONS.has(condition)) {
        const target = pickTarget(nested);
        if (target !== undefined) return target;
      }
    }
  }
  return undefined;
}

/** What a package's `exports` field maps a subpath to, for `import`. */
function exportFor(exports: unknown, subpath: string): string | undefined {
  const isSubpathMap =
    typeof exports === 'object' &&
    exports !== null &&
    !Array.isArray(exports) &&
    Object.keys(exports).some((key) => key.startsWith('.'));

  if (isSubpathMap) {
    return pickTarget((exports as Record<string, unknown>)[subpath]);
  }
  return subpath === '.' ? pickTarget(exports) : undefined;
}

/** The package's entry point for `import`, read from its `exports`. */
function resolveByImport(specifier: string, fromFile: string): string | undefined {
  const {name, subpath} = splitSpecifier(specifier);

  let directory = path.dirname(path.resolve(fromFile));
  for (;;) {
    const packageDirectory = path.join(directory, 'node_modules', name);
    const manifest = path.join(packageDirectory, 'package.json');
    if (fs.existsSync(manifest)) {
      let exports: unknown;
      try {
        exports = (JSON.parse(fs.readFileSync(manifest, 'utf8')) as {exports?: unknown}).exports;
      } catch {
        return undefined;
      }
      const target = exportFor(exports, subpath);
      return target === undefined ? undefined : path.resolve(packageDirectory, target);
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

/**
 * Resolves a package specifier from `fromFile`, as `require` would, or as
 * `import` would for a package that only exports for `import`. Throws what
 * `require` threw when neither finds it.
 */
export function resolvePackage(specifier: string, fromFile: string): string {
  try {
    return createRequire(pathToFileURL(fromFile)).resolve(specifier);
  } catch (thrown) {
    const resolved = resolveByImport(specifier, fromFile);
    if (resolved === undefined) {
      throw thrown;
    }
    return resolved;
  }
}
