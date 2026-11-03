const fs = require('fs');

const manifest = JSON.parse(
  fs.readFileSync('manifest.json', 'utf8')
);

const version = manifest.version;

function updateVersion(file, text) {
  const content = fs.readFileSync(file, 'utf8');

  const updated = content.replace(
    /<!-- VERSION-START -->[\s\S]*?<!-- VERSION-END -->/,
    `<!-- VERSION-START -->\n${text(version)}\n<!-- VERSION-END -->`
  );

  if (updated === content) {
    console.log(`${file}: already up to date (${version})`);
    return;
  }

  fs.writeFileSync(file, updated, 'utf8');

  console.log(`${file}: updated to ${version}`);
}

updateVersion(
  'README.md',
  version => `> Current plugin version: **${version}**`
);

updateVersion(
  'README_PL.md',
  version => `> Aktualna wersja wtyczki: **${version}**`
);
