'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');
const os = require('os');
const path = require('path');

function run(command, args = [], options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...options,
  });
}

function capture(command, args = []) {
  return run(command, args, {
    capture: true,
  }).trim();
}

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function incrementPatch(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    fail(`Invalid stable version in manifest.json: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]) + 1;

  return `${major}.${minor}.${patch}`;
}

// ------------------------------------------------------------
// Validate repository state
// ------------------------------------------------------------

const branch = capture('git', ['branch', '--show-current']);

if (branch !== 'main') {
  fail(`Beta must be created from main. Current: ${branch}`);
}

const status = capture('git', ['status', '--porcelain']);

if (status) {
  fail('Working tree is not clean. Commit changes before beta.');
}

console.log('Fetching origin/main and tags...');

run('git', ['fetch', 'origin', 'main', '--tags']);

const localHead = capture('git', ['rev-parse', 'HEAD']);

const remoteHead = capture('git', ['rev-parse', 'origin/main']);

if (localHead !== remoteHead) {
  fail('Local main differs from origin/main.');
}

// ------------------------------------------------------------
// Determine beta version
// ------------------------------------------------------------

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

const stableVersion = manifest.version;
const nextVersion = incrementPatch(stableVersion);

const tags = capture('git', ['tag', '--list', `${nextVersion}-beta.*`])
  .split('\n')
  .filter(Boolean);

let highestBeta = 0;

for (const tag of tags) {
  const match = tag.match(new RegExp(`^${nextVersion.replace(/\./g, '\\.')}\\-beta\\.(\\d+)$`));

  if (match) {
    highestBeta = Math.max(highestBeta, Number(match[1]));
  }
}

const betaVersion = `${nextVersion}-beta.${highestBeta + 1}`;

console.log('');
console.log(`Stable version: ${stableVersion}`);

console.log(`Creating beta: ${betaVersion}`);

console.log('');

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

console.log('Checking JavaScript...');

run('node', ['--check', 'main.js']);

console.log('Checking formatting...');

run('npm', ['run', 'format:check']);

console.log('Checking dependencies...');

run('npm', ['audit', '--audit-level=high']);

// ------------------------------------------------------------
// Prepare temporary beta assets
// ------------------------------------------------------------

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'two-euro-beta-'));

const files = ['main.js', 'styles.css'];

for (const file of files) {
  fs.copyFileSync(file, path.join(tmpRoot, file));
}

const betaManifest = {
  ...manifest,
  version: betaVersion,
};

fs.writeFileSync(
  path.join(tmpRoot, 'manifest.json'),
  JSON.stringify(betaManifest, null, 2) + '\n',
  'utf8'
);

// ------------------------------------------------------------
// Create GitHub prerelease
// ------------------------------------------------------------

console.log(`Creating GitHub pre-release ${betaVersion}...`);

run('gh', [
  'release',
  'create',
  betaVersion,

  path.join(tmpRoot, 'main.js'),
  path.join(tmpRoot, 'manifest.json'),
  path.join(tmpRoot, 'styles.css'),

  '--title',
  betaVersion,

  '--target',
  localHead,

  '--generate-notes',
  '--prerelease',
]);

fs.rmSync(tmpRoot, {
  recursive: true,
  force: true,
});

console.log('');
console.log(`Beta ${betaVersion} created successfully.`);

console.log('manifest.json on main was NOT modified.');

console.log('');
console.log('Install or update this version using BRAT.');
