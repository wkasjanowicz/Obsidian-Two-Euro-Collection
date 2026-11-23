'use strict';
/*
 * Publishes StarterData/starter-pack.json to the "starter-pack" branch of the
 * GitHub repository. The branch always holds a single commit (force push), so
 * old packs do not accumulate in the git history. The plugin downloads the
 * pack from:
 *   https://raw.githubusercontent.com/<owner>/<repo>/starter-pack/starter-pack.json
 *
 * Usage: npm run starter-pack (build) and then npm run starter-pack:publish
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BRANCH = 'starter-pack';
const source = path.resolve('StarterData/starter-pack.json');

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}
const run = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'inherit' });
const capture = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

if (!fs.existsSync(source))
  fail('StarterData/starter-pack.json not found. Run npm run starter-pack first.');
const pack = JSON.parse(fs.readFileSync(source, 'utf8'));
if (pack.schemaVersion !== 1 || !Array.isArray(pack.coins) || !pack.coins.length)
  fail('StarterData/starter-pack.json has an invalid format or no coins.');
const withoutCover = pack.coins.filter((coin) => !coin.cover?.base64).length;
if (withoutCover) fail(`Starter pack contains ${withoutCover} coin(s) without a cover.`);

const remote = capture(['remote', 'get-url', 'origin'], process.cwd());
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'two-euro-starter-'));
try {
  fs.copyFileSync(source, path.join(temp, 'starter-pack.json'));
  fs.writeFileSync(
    path.join(temp, 'README.md'),
    '# 2 Euro Collection – starter pack\n\n' +
      'Downloaded by the plugin command **Install starter collection**. ' +
      'Generated with `npm run starter-pack` on the main branch; this branch is force-pushed.\n'
  );
  run(['init', '-q'], temp);
  run(['checkout', '-q', '-b', BRANCH], temp);
  run(['add', '.'], temp);
  run(
    [
      'commit',
      '-q',
      '-m',
      `Starter pack: ${pack.coins.length} coins (${pack.generatedAt || 'unknown date'})`,
    ],
    temp
  );
  run(['push', '--force', remote, `${BRANCH}:${BRANCH}`], temp);
  const size = (fs.statSync(source).size / 1e6).toFixed(1);
  console.log(`\nPublished ${pack.coins.length} coins (${size} MB) to the "${BRANCH}" branch.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
