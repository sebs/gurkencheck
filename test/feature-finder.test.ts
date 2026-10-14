import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {after, before, beforeEach, test} from 'node:test';
import {
  DEFAULT_IGNORED_PATTERNS,
  DEFAULT_IGNORE_FILE_NAME,
  describeInvalidPattern,
  findIgnoreFile,
  findFeatureFileStream,
  findFeatureFiles,
  readIgnorePatterns,
  splitIgnoreList,
} from '../src/feature-finder.ts';
import {ignoresCase} from '../src/util/glob.ts';

const FOUND = 'folder/with/found/features';
const originalCwd = process.cwd();
let workingDirectory: string;

/** Builds the same tree the old mock-fs based test used. */
function buildTree(): void {
  fs.mkdirSync(`${FOUND}/folder`, {recursive: true});
  fs.writeFileSync(`${FOUND}/a.feature`, '');
  fs.writeFileSync(`${FOUND}/folder/b.feature`, '');
  fs.writeFileSync(`${FOUND}/c.txt`, '');
  fs.mkdirSync('feature', {recursive: true});
  fs.writeFileSync('feature/f.txt', '');
  // A directory whose name ends in .feature must not be treated as a file.
  fs.mkdirSync('directory.feature', {recursive: true});
}

before(() => {
  workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-finder-'));
  process.chdir(workingDirectory);
});

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(workingDirectory, {recursive: true, force: true});
});

beforeEach(() => {
  fs.rmSync(workingDirectory, {recursive: true, force: true});
  fs.mkdirSync(workingDirectory, {recursive: true});
  process.chdir(workingDirectory);
  buildTree();
});

const bothFeatures = [`${FOUND}/a.feature`, `${FOUND}/folder/b.feature`];

test('searches the working directory recursively when given no patterns', () => {
  assert.deepEqual(findFeatureFiles([]).files, bothFeatures);
});

test('expands a "dir/**" pattern recursively', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/**`]).files, bothFeatures);
});

test('honours a "dir/*.feature" pattern literally', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/*.feature`]).files, [`${FOUND}/a.feature`]);
});

test('searches a directory recursively when given its path', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/`]).files, bothFeatures);
});

test('finds a file named by an absolute path', () => {
  // A pattern is matched against paths relative to the working directory, so
  // an absolute one used to match nothing at all and report a clean run.
  assert.deepEqual(findFeatureFiles([path.resolve(`${FOUND}/a.feature`)]).files, [
    `${FOUND}/a.feature`,
  ]);
});

test('searches a directory named by an absolute path', () => {
  assert.deepEqual(findFeatureFiles([path.resolve(FOUND)]).files, bothFeatures);
});

test('never returns the same file twice', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/**`, 'path/to/fake/**']).files, bothFeatures);
});

test('never returns a directory whose name ends in .feature', () => {
  assert.ok(!findFeatureFiles([]).files.includes('directory.feature'));
});

test('skips files matching the --ignore argument', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/**`], [`${FOUND}/**`]).files, []);
});

test(`skips files matching ${DEFAULT_IGNORE_FILE_NAME}`, () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, `${FOUND}/a.feature\n\n${FOUND}/**\n`);
  assert.deepEqual(findFeatureFiles([`${FOUND}/**`]).files, []);
});

test('reports a pattern that names nothing usable', () => {
  const {files, invalidPatterns} = findFeatureFiles(['no-such-directory']);
  assert.deepEqual(files, []);
  assert.deepEqual(invalidPatterns, ['no-such-directory']);
});

test('ignores node_modules by default', () => {
  fs.mkdirSync('node_modules/some-package', {recursive: true});
  fs.writeFileSync('node_modules/some-package/vendored.feature', '');
  assert.deepEqual(findFeatureFiles([]).files, bothFeatures);
});

test('reads ignore patterns from a file, skipping blanks and comments', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, '# a comment\n\nbuild/**\n  vendor/**  \n');
  assert.deepEqual(readIgnorePatterns(undefined), ['build/**', 'vendor/**', 'node_modules']);
});

test('the --ignore argument wins over the ignore file', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, 'build/**\n');
  assert.deepEqual(readIgnorePatterns(['other/**']), ['other/**', 'node_modules']);
});

// https://github.com/gherkin-lint/gherkin-lint/issues/172
test('a bare directory name in the ignore file skips the whole directory', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, 'folder\n');
  assert.deepEqual(findFeatureFiles([`${FOUND}/**`]).files, []);
});

test('a wildcard directory pattern in the ignore file skips the whole directory', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, 'f*r\n');
  assert.deepEqual(findFeatureFiles([]).files, []);
});

test('an ignore file that cannot be read is an error, not passed over', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, 'build\n');
  fs.chmodSync(DEFAULT_IGNORE_FILE_NAME, 0o000);
  try {
    // Running as root defeats the permission bits, so there is nothing to test.
    try {
      fs.readFileSync(DEFAULT_IGNORE_FILE_NAME, 'utf8');
      return;
    } catch {
      // Good: it really is unreadable.
    }
    assert.throws(() => readIgnorePatterns(undefined), /Could not read the ignore file ".*": permission denied/u);
  } finally {
    fs.chmodSync(DEFAULT_IGNORE_FILE_NAME, 0o644);
    fs.rmSync(DEFAULT_IGNORE_FILE_NAME, {force: true});
  }
});

/** Everything the streaming search finds, in the order it finds it. */
async function streamed(
  patterns: readonly string[],
  ignore?: readonly string[],
): Promise<string[]> {
  const found: string[] = [];
  for await (const file of findFeatureFileStream(patterns, ignore).files) {
    found.push(file);
  }
  return found;
}

test('the streaming search finds what the collected one finds', async () => {
  buildTree();
  for (const patterns of [[], ['.'], [FOUND], [`${FOUND}/**`], ['**/*.feature']]) {
    assert.deepEqual(
      await streamed(patterns),
      findFeatureFiles(patterns).files,
      `patterns: ${JSON.stringify(patterns)}`,
    );
  }
});

test('the streaming search honours the ignore patterns', async () => {
  buildTree();
  assert.deepEqual(
    await streamed(['.'], ['**/folder/**']),
    findFeatureFiles(['.'], ['**/folder/**']).files,
  );
});

test('the streaming search reports a bad pattern before walking anything', () => {
  buildTree();
  const {invalidPatterns} = findFeatureFileStream(['no-such-directory']);
  // Known without the stream having been touched, so a bad argument can be
  // given up on before any searching is done.
  assert.deepEqual(invalidPatterns, ['no-such-directory']);
});

test('the streaming search hands the same file over only once', async () => {
  buildTree();
  // Two patterns reaching the same files: the overlap must not be repeated.
  const found = await streamed([FOUND, `${FOUND}/**`, '.']);
  assert.deepEqual(found, [...new Set(found)]);
  assert.deepEqual(found.sort(), findFeatureFiles(['.']).files.sort());
});

test('reports a feature file that does not exist', () => {
  // Treated as a glob matching nothing, it used to end in a clean run.
  const {files, invalidPatterns} = findFeatureFiles(['missing.feature']);
  assert.deepEqual(files, []);
  assert.deepEqual(invalidPatterns, ['missing.feature']);
});

test('finds a file named explicitly even when a search would skip it', () => {
  fs.writeFileSync('.hidden.feature', '');
  fs.symlinkSync(`${FOUND}/a.feature`, 'link.feature');
  assert.deepEqual(findFeatureFiles(['.hidden.feature']).files, ['.hidden.feature']);
  assert.deepEqual(findFeatureFiles(['link.feature']).files, ['link.feature']);
});

test('finds files and directories whose names hold glob characters', () => {
  fs.mkdirSync('specs [wip]/{x}', {recursive: true});
  fs.writeFileSync('specs [wip]/{x}/w.feature', '');
  fs.writeFileSync('[x].feature', '');
  assert.deepEqual(findFeatureFiles(['[x].feature']).files, ['[x].feature']);
  assert.deepEqual(findFeatureFiles(['specs [wip]']).files, ['specs [wip]/{x}/w.feature']);
});

test('searches a directory whose name ends in .feature', () => {
  fs.writeFileSync('directory.feature/inside.feature', '');
  assert.deepEqual(findFeatureFiles(['directory.feature']).files, [
    'directory.feature/inside.feature',
  ]);
});

test('the streaming search finds a file named explicitly', async () => {
  fs.writeFileSync('.hidden.feature', '');
  assert.deepEqual(await streamed(['.hidden.feature']), ['.hidden.feature']);
});

test('node_modules is skipped by default at any depth', () => {
  fs.mkdirSync('packages/app/node_modules/dep', {recursive: true});
  fs.writeFileSync('packages/app/node_modules/dep/vendored.feature', '');
  assert.deepEqual(findFeatureFiles([]).files, bothFeatures);
});

test('an ignore file starting with a byte order mark still reads its first pattern', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, '﻿build\n');
  assert.deepEqual(readIgnorePatterns(undefined), ['build', 'node_modules']);
});

test('names a feature file asked for outright that the ignore patterns skip', () => {
  fs.mkdirSync('node_modules/pkg', {recursive: true});
  fs.writeFileSync('node_modules/pkg/x.feature', '');

  const search = findFeatureFiles(['node_modules/pkg/x.feature', `${FOUND}/a.feature`]);
  assert.deepEqual(search.files, [`${FOUND}/a.feature`]);
  assert.deepEqual(search.ignoredFiles, ['node_modules/pkg/x.feature']);

  const stream = findFeatureFileStream([`${FOUND}/a.feature`], [`${FOUND}/a.feature`]);
  assert.deepEqual(stream.ignoredFiles, [`${FOUND}/a.feature`]);
});

test('does not count a glob as something asked for outright', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/**`], [FOUND]).ignoredFiles, []);
});

test('an ignore list that comes to nothing still skips node_modules', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, '# nothing to skip yet\n\n');
  assert.deepEqual(readIgnorePatterns(undefined), DEFAULT_IGNORED_PATTERNS);
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, '');
  assert.deepEqual(readIgnorePatterns(undefined), DEFAULT_IGNORED_PATTERNS);
  fs.rmSync(DEFAULT_IGNORE_FILE_NAME);
  assert.deepEqual(readIgnorePatterns(['']), DEFAULT_IGNORED_PATTERNS);
  assert.deepEqual(readIgnorePatterns(['  ', 'build']), ['build', 'node_modules']);
});

test('takes any glob, and the directories it matches, keeping only feature files', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/*`]).files.sort(), bothFeatures);
  assert.deepEqual(findFeatureFiles([`${FOUND}/**/`]).files, bothFeatures);
  assert.deepEqual(findFeatureFiles(['folder/*/found']).files.sort(), bothFeatures);
  assert.deepEqual(findFeatureFiles(['**']).files, bothFeatures);
  assert.deepEqual(findFeatureFiles([`${FOUND}/?.feature`]).files, [`${FOUND}/a.feature`]);
  // c.txt matches the glob, but is not a feature file.
  assert.deepEqual(findFeatureFiles([`${FOUND}/c*`]).files, []);
  assert.deepEqual(findFeatureFiles([`${FOUND}/c*`]).invalidPatterns, []);
});

test('the streaming search takes the same globs, handing each file over once', async () => {
  const found: string[] = [];
  for await (const file of findFeatureFileStream([`${FOUND}/*`]).files) {
    found.push(file);
  }
  assert.deepEqual(found.sort(), bothFeatures);
});

test('says why a name was refused', () => {
  assert.equal(describeInvalidPattern('missing.feature'), '"missing.feature" does not exist.');
  assert.equal(describeInvalidPattern(`${FOUND}/c.txt`), `"${FOUND}/c.txt" is not a .feature file.`);
  if (process.platform !== 'win32') {
    execFileSync('mkfifo', ['pipe.feature']);
    assert.equal(describeInvalidPattern('pipe.feature'), '"pipe.feature" is neither a file nor a directory.');
    assert.deepEqual(findFeatureFiles(['pipe.feature']).invalidPatterns, ['pipe.feature']);
  }
});

test('a file named twice, through a symlink or in another case, is found once', async () => {
  fs.symlinkSync('a.feature', `${FOUND}/link.feature`);
  const named = [`${FOUND}/a.feature`, `${FOUND}/link.feature`];
  // On a file system that ignores case, A.feature is a.feature as well.
  const ignoresCase = fs.existsSync(`${FOUND}/A.feature`);
  if (ignoresCase) named.push(`${FOUND}/A.feature`);

  assert.deepEqual(findFeatureFiles(named).files, [`${FOUND}/a.feature`]);
  const streamed: string[] = [];
  for await (const file of findFeatureFileStream(named).files) streamed.push(file);
  assert.deepEqual(streamed, [`${FOUND}/a.feature`]);
});

test('the nearest ignore file above the working directory is used, relative to where it is', () => {
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, `${FOUND}/folder\n`);
  process.chdir('folder');
  try {
    assert.equal(findIgnoreFile(), path.join(fs.realpathSync(workingDirectory), DEFAULT_IGNORE_FILE_NAME));
    // folder/with/found/features/folder is skipped, seen from folder/ too.
    assert.deepEqual(findFeatureFiles(['.']).files, ['with/found/features/a.feature']);
  } finally {
    process.chdir(workingDirectory);
  }
});

test('a file named in another case is reported as the disk spells it', () => {
  // Only meaningful where the file system ignores case.
  if (!fs.existsSync(`${FOUND}/A.feature`)) return;
  assert.deepEqual(findFeatureFiles([`${FOUND}/A.feature`]).files, [`${FOUND}/a.feature`]);
  assert.deepEqual(findFeatureFiles([`${FOUND.toUpperCase()}/A.FEATURE`]).files, [`${FOUND}/a.feature`]);
});

test('a directory asked for outright and skipped whole checked nothing', () => {
  const search = findFeatureFiles([FOUND], ['with']);
  assert.deepEqual(search.files, []);
  assert.deepEqual(search.ignoredFiles, []);
  assert.deepEqual(search.allIgnored, [FOUND]);
  assert.deepEqual(findFeatureFiles([FOUND], ['other']).allIgnored, []);
});

test('an ignore pattern skips a directory spelled in another case where the disk ignores case', () => {
  if (!ignoresCase(workingDirectory)) return;
  fs.mkdirSync('Build', {recursive: true});
  fs.writeFileSync('Build/b.feature', '');
  assert.deepEqual(findFeatureFiles(['.'], ['build']).files.filter((file) => file.startsWith('Build')), []);
});

test('a glob spelling out a leading dot reaches dot-directories, and * still does not', () => {
  fs.mkdirSync('.hidden/inner', {recursive: true});
  fs.writeFileSync('.hidden/a.feature', '');
  fs.writeFileSync('.hidden/inner/b.feature', '');
  fs.mkdirSync('.hidden/.deeper', {recursive: true});
  fs.writeFileSync('.hidden/.deeper/c.feature', '');
  assert.deepEqual(findFeatureFiles(['.h*']).files.sort(), ['.hidden/a.feature', '.hidden/inner/b.feature']);
  assert.deepEqual(findFeatureFiles(['.*/**/*.feature']).files.sort(), ['.hidden/a.feature', '.hidden/inner/b.feature']);
  assert.deepEqual(findFeatureFiles(['*']).files.filter((file) => file.startsWith('.hidden')), []);
});

test('a file named with a slash after it is the file', () => {
  assert.deepEqual(findFeatureFiles([`${FOUND}/a.feature/`]).files, [`${FOUND}/a.feature`]);
  assert.deepEqual(findFeatureFiles([`${FOUND}/a.feature/`]).invalidPatterns, []);
});

test('says what is wrong with a symlink loop, a dangling symlink and an unreachable file', () => {
  fs.symlinkSync('loop', 'loop');
  fs.symlinkSync('gone.feature', 'dangling.feature');
  assert.equal(describeInvalidPattern('loop'), '"loop" is a symlink that leads back to itself.');
  assert.equal(describeInvalidPattern('dangling.feature'), '"dangling.feature" is a symlink to gone.feature, which does not exist.');
  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    fs.mkdirSync('locked');
    fs.writeFileSync('locked/a.feature', '');
    fs.chmodSync('locked', 0o000);
    try {
      assert.equal(describeInvalidPattern('locked/a.feature'), '"locked/a.feature" cannot be reached: permission denied.');
    } finally {
      fs.chmodSync('locked', 0o755);
    }
  }
});

test('asked about a path that is fine, describeInvalidPattern says so', () => {
  assert.equal(describeInvalidPattern(FOUND), `"${FOUND}" is a directory, which names feature files to check.`);
  assert.equal(
    describeInvalidPattern(`${FOUND}/a.feature`),
    `"${FOUND}/a.feature" is a feature file, which names itself to check.`,
  );
});

test('an ignore list adds to node_modules, and !node_modules brings it back', () => {
  fs.mkdirSync('node_modules/pkg', {recursive: true});
  fs.writeFileSync('node_modules/pkg/x.feature', '');
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, 'feature\n');
  assert.deepEqual(findFeatureFiles(['.']).files.filter((file) => file.startsWith('node_modules')), []);
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, 'feature\n!node_modules\n');
  assert.deepEqual(findFeatureFiles(['.']).files.filter((file) => file.startsWith('node_modules')), [
    'node_modules/pkg/x.feature',
  ]);
  assert.deepEqual(findFeatureFiles(['.'], ['other']).files.filter((file) => file.startsWith('node_modules')), []);
});

test('a file or directory named like a glob does not narrow the glob to itself', () => {
  fs.writeFileSync(`${FOUND}/*.feature`, '');
  assert.deepEqual(findFeatureFiles([`${FOUND}/*.feature`]).files.sort(), [`${FOUND}/*.feature`, `${FOUND}/a.feature`]);

  fs.mkdirSync('**', {recursive: true});
  fs.writeFileSync('**/*.feature', '');
  const found = findFeatureFiles(['**/*.feature']).files;
  assert.ok(found.includes(`${FOUND}/a.feature`), JSON.stringify(found));
  assert.ok(found.includes(`${FOUND}/folder/b.feature`), JSON.stringify(found));
});

test('a glob that matches nothing is still taken as the name it is', () => {
  fs.mkdirSync('wip', {recursive: true});
  fs.writeFileSync('wip/[draft].feature', '');
  // As a glob, [draft] is one of d, r, a, f, t - none of which is there.
  assert.deepEqual(findFeatureFiles(['wip/[draft].feature']).files, ['wip/[draft].feature']);
});

test('a dot pattern does not skip what is reached through ../', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'x.feature'), '');
    fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, '.*\n');
    const relative = path.relative(process.cwd(), path.join(outside, 'x.feature'));
    assert.deepEqual(findFeatureFiles([relative]).files, [relative]);
    assert.deepEqual(findFeatureFiles([relative]).ignoredFiles, []);
  } finally {
    fs.rmSync(outside, {recursive: true, force: true});
  }
});

test('a brace alternative spelling out a dot directory reaches it', () => {
  fs.mkdirSync('.github/specs', {recursive: true});
  fs.mkdirSync('specs', {recursive: true});
  fs.writeFileSync('.github/specs/a.feature', '');
  fs.writeFileSync('specs/b.feature', '');
  assert.deepEqual(findFeatureFiles(['{specs,.github/specs}/*.feature']).files.sort(), ['.github/specs/a.feature', 'specs/b.feature']);
  assert.deepEqual(findFeatureFiles(['{.github,specs}/specs/*.feature']).files, ['.github/specs/a.feature']);
});

test('a negation meant for something else does not bring node_modules back', () => {
  fs.mkdirSync('node_modules/pkg', {recursive: true});
  fs.writeFileSync('node_modules/pkg/x.feature', '');
  fs.writeFileSync(DEFAULT_IGNORE_FILE_NAME, '*\n!*/\n!*.feature\n');
  assert.deepEqual(findFeatureFiles(['.']).files.filter((file) => file.startsWith('node_modules')), []);
  assert.ok(findFeatureFiles(['.']).files.includes(`${FOUND}/a.feature`));
});

test('a glob whose directories are typed in another case reports them as the disk spells them', () => {
  if (!fs.existsSync(FOUND.toUpperCase())) return;
  assert.deepEqual(findFeatureFiles([`${FOUND.toUpperCase()}/*.feature`]).files, [`${FOUND}/a.feature`]);
});

test('a string where a list of paths belongs is refused, not searched letter by letter', () => {
  for (const find of [findFeatureFiles, findFeatureFileStream]) {
    assert.throws(() => find('features' as unknown as string[]), {
      name: 'TypeError',
      message: 'Expected a list of paths, not the string "features". Put it in an array.',
    });
    assert.throws(() => find(['features'], 'build' as unknown as string[]), /Expected a list of ignore patterns/u);
  }
});

test('a name typed as a feature file that is not one on disk is not called one', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gurkencheck-case-name-'));
  try {
    fs.writeFileSync(path.join(directory, 'c.FEATURE'), 'Feature: C\n');
    if (!ignoresCase(directory)) return;
    const typed = path.join(directory, 'c.feature');
    const search = findFeatureFiles([typed]);
    assert.deepEqual(search.invalidPatterns, [typed]);
    assert.equal(
      describeInvalidPattern(typed),
      `"${typed}" is "${path.join(directory, 'c.FEATURE')}" on disk, which is not a .feature file.`,
    );
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('an --ignore list is split at its commas, but not at those inside braces or brackets', () => {
  assert.deepEqual(splitIgnoreList('wip, legacy'), ['wip', 'legacy']);
  assert.deepEqual(splitIgnoreList('{wip,features/*.draft.feature}'), ['{wip,features/*.draft.feature}']);
  assert.deepEqual(splitIgnoreList('*.{wip,draft}.feature,build'), ['*.{wip,draft}.feature', 'build']);
  assert.deepEqual(splitIgnoreList('a\\,b,c'), ['a\\,b', 'c']);
});
