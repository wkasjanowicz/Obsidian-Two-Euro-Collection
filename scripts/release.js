const fs = require('fs');
const { execFileSync } = require('child_process');

const root = process.cwd();
const manifestFile = 'manifest.json';
const requiredFiles = [manifestFile, 'main.js', 'styles.css', 'README.md', 'README_PL.md'];

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function run(command, args = [], options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...options,
  });
}

function capture(command, args = []) {
  return run(command, args, { capture: true }).trim();
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}

function validVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function compareVersions(a, b) {
  const av = a.split('.').map(Number);
  const bv = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return 0;
}

function incrementVersion(current, type) {
  let [major, minor, patch] = current.split('.').map(Number);
  if (type === 'patch') patch += 1;
  else if (type === 'minor') {
    minor += 1;
    patch = 0;
  } else if (type === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else fail(`Unknown increment type: ${type}`);
  return `${major}.${minor}.${patch}`;
}

function updateReadme(file, line) {
  const markerRegex = /<!-- VERSION-START -->[\s\S]*?<!-- VERSION-END -->/;
  const legacyRegex = /^>\s*(Current plugin version|Aktualna wersja wtyczki):.*$/m;
  const block = `<!-- VERSION-START -->\n${line}\n<!-- VERSION-END -->`;
  let content = read(file);

  if (markerRegex.test(content)) {
    content = content.replace(markerRegex, block);
  } else if (legacyRegex.test(content)) {
    content = content.replace(legacyRegex, block);
  } else {
    fail(`Version marker or version line not found in ${file}`);
  }

  write(file, content);
}

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) fail(`Required file not found: ${file}`);
}

try {
  if (capture('git', ['rev-parse', '--is-inside-work-tree']) !== 'true') {
    fail('Current directory is not a Git repository.');
  }
} catch {
  fail('Current directory is not a Git repository.');
}

const branch = capture('git', ['branch', '--show-current']);
if (branch !== 'main')
  fail(`Release must be created from main, current branch: ${branch || '(detached HEAD)'}`);

const dirty = capture('git', ['status', '--porcelain']);
if (dirty) fail(`Working tree is not clean:\n${dirty}\nCommit or discard changes first.`);

console.log('Fetching origin/main and tags...');
run('git', ['fetch', 'origin', 'main', '--tags']);

const localHead = capture('git', ['rev-parse', 'HEAD']);
const remoteHead = capture('git', ['rev-parse', 'origin/main']);
if (localHead !== remoteHead) {
  fail(
    'Local main is not identical to origin/main. Pull/rebase or push pending commits before releasing.'
  );
}

const manifest = JSON.parse(read(manifestFile));
const currentVersion = manifest.version;
if (!validVersion(currentVersion)) fail(`Invalid version in manifest.json: ${currentVersion}`);

const request = process.argv[2];
if (!request)
  fail(
    'Usage: npm run release:patch | release:minor | release:major | npm run release:version -- X.Y.Z'
  );

const targetVersion = ['patch', 'minor', 'major'].includes(request)
  ? incrementVersion(currentVersion, request)
  : request;

if (!validVersion(targetVersion)) fail(`Invalid target version: ${targetVersion}`);
if (compareVersions(targetVersion, currentVersion) <= 0) {
  fail(`Target version ${targetVersion} must be greater than current version ${currentVersion}.`);
}

try {
  capture('git', ['rev-parse', '-q', '--verify', `refs/tags/${targetVersion}`]);
  fail(`Git tag ${targetVersion} already exists.`);
} catch (error) {
  if (error.status === 1 || error.status === 128) {
    // Expected: tag does not exist.
  } else if (error.message && error.message.startsWith('Git tag')) {
    throw error;
  }
}

console.log(`Preparing release ${currentVersion} -> ${targetVersion}`);

manifest.version = targetVersion;
write(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
updateReadme('README.md', `> Current plugin version: **${targetVersion}**`);
updateReadme('README_PL.md', `> Aktualna wersja wtyczki: **${targetVersion}**`);

try {
  console.log('Formatting source files...');
  run('npx', [
    'prettier',
    '--write',
    'main.js',
    'scripts/**/*.js',
    '*.json',
    '.github/workflows/*.yml',
  ]);

  console.log('Validating main.js...');
  run('node', ['--check', 'main.js']);
  console.log('Validating JSON files...');
  JSON.parse(read(manifestFile));
  const plFile = fs.existsSync('Languages/pl.json')
    ? 'Languages/pl.json'
    : fs.existsSync('pl.json')
      ? 'pl.json'
      : null;
  if (plFile) JSON.parse(read(plFile));

  run('git', [
    'add',
    'main.js',
    'manifest.json',
    'README.md',
    'README_PL.md',
    'package.json',
    'package-lock.json',
    'scripts/release.js',
    '.github/workflows/release.yml',
  ]);

  run('git', ['commit', '-m', `Release ${targetVersion}`]);
  run('git', ['push', 'origin', 'main']);
} catch (error) {
  console.error('\nRelease failed. Restoring files changed by the release script...');
  try {
    run('git', ['restore', '--staged', 'manifest.json', 'README.md', 'README_PL.md']);
    run('git', ['restore', 'manifest.json', 'README.md', 'README_PL.md']);
  } catch {}
  throw error;
}

console.log(`\nRelease ${targetVersion} commit was pushed.`);
console.log('GitHub Actions will create the tag and GitHub Release.');
