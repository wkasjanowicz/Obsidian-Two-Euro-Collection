const fs = require('fs');
const { execSync } = require('child_process');

const version = process.argv[2];

if (!version) {
  console.error('Usage: node scripts/release.js <version>');
  console.error('Example: node scripts/release.js 0.5.49');
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version: ${version}`);
  console.error('Expected format: X.Y.Z, for example 0.5.49');
  process.exit(1);
}


// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}

function exists(file) {
  if (!fs.existsSync(file)) {
    console.error(`Required file not found: ${file}`);
    process.exit(1);
  }
}


// ------------------------------------------------------------
// Validate required files
// ------------------------------------------------------------

[
  'manifest.json',
  'main.js',
  'styles.css',
  'README.md',
  'README_PL.md'
].forEach(exists);


// ------------------------------------------------------------
// Check Git repository
// ------------------------------------------------------------

try {
  execSync('git rev-parse --is-inside-work-tree', {
    stdio: 'ignore'
  });
} catch {
  console.error('Current directory is not a Git repository.');
  process.exit(1);
}


// ------------------------------------------------------------
// Prevent release from an already dirty working tree
// ------------------------------------------------------------

const gitStatus = execSync('git status --porcelain', {
  encoding: 'utf8'
}).trim();

if (gitStatus) {
  console.error('');
  console.error('Working tree contains uncommitted changes:');
  console.error('');
  console.error(gitStatus);
  console.error('');
  console.error(
    'Commit or discard existing changes before preparing a release.'
  );

  process.exit(1);
}


// ------------------------------------------------------------
// Update manifest.json
// ------------------------------------------------------------

const manifest = JSON.parse(read('manifest.json'));

const oldVersion = manifest.version;

if (oldVersion === version) {
  console.error(
    `manifest.json already contains version ${version}.`
  );
  process.exit(1);
}

manifest.version = version;

write(
  'manifest.json',
  JSON.stringify(manifest, null, 2) + '\n'
);

console.log(
  `manifest.json: ${oldVersion} -> ${version}`
);


// ------------------------------------------------------------
// Update README files
// ------------------------------------------------------------

function updateReadme(file, line) {
  let content = read(file);

  const block =
    `<!-- VERSION-START -->\n` +
    `${line}\n` +
    `<!-- VERSION-END -->`;

  const markerRegex =
    /<!-- VERSION-START -->[\s\S]*?<!-- VERSION-END -->/;

  if (markerRegex.test(content)) {
    content = content.replace(
      markerRegex,
      block
    );
  } else {
    // Migration from older README without markers.
    const versionLine =
      /^>\s*(Current plugin version|Aktualna wersja wtyczki):.*$/m;

    if (!versionLine.test(content)) {
      console.error(
        `Version line not found in ${file}`
      );
      process.exit(1);
    }

    content = content.replace(
      versionLine,
      block
    );
  }

  write(file, content);

  console.log(
    `${file}: updated to ${version}`
  );
}

updateReadme(
  'README.md',
  `> Current plugin version: **${version}**`
);

updateReadme(
  'README_PL.md',
  `> Aktualna wersja wtyczki: **${version}**`
);


// ------------------------------------------------------------
// Validate JavaScript
// ------------------------------------------------------------

console.log('Checking main.js syntax...');

try {
  execSync('node --check main.js', {
    stdio: 'inherit'
  });
} catch {
  console.error('');
  console.error('main.js contains a syntax error.');
  console.error('Release preparation aborted.');
  process.exit(1);
}


// ------------------------------------------------------------
// Validate JSON
// ------------------------------------------------------------

console.log('Checking manifest.json...');

try {
  JSON.parse(read('manifest.json'));
} catch (error) {
  console.error(
    `Invalid manifest.json: ${error.message}`
  );
  process.exit(1);
}


// ------------------------------------------------------------
// Summary
// ------------------------------------------------------------

console.log('');
console.log('--------------------------------');
console.log(`Release ${version} prepared.`);
console.log('--------------------------------');
console.log('');

console.log('Changed files:');

const changed = execSync(
  'git status --short',
  { encoding: 'utf8' }
).trim();

console.log(changed || '(none)');

console.log('');
console.log('Next commands:');
console.log('');
console.log('git add manifest.json README.md README_PL.md');
console.log(`git commit -m "Release ${version}"`);
console.log('git push');
console.log('');
console.log(
  'GitHub Actions will create the GitHub Release after the push.'
);
