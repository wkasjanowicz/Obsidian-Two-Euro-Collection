'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

/*
 * Covers are stored in the starter pack as WebP (max 1200 px, quality 85).
 * This keeps transparency and makes the pack about 6x smaller than PNG.
 */
const COVER_MAX_SIZE = 1200;
const COVER_WEBP_QUALITY = 85;

let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.error('\nERROR: The "sharp" package is required. Run: npm install\n');
  console.error(error?.message || error);
  process.exit(1);
}

async function encodeCover(buffer) {
  return sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(COVER_MAX_SIZE, COVER_MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: COVER_WEBP_QUALITY, alphaQuality: 90, effort: 5 })
    .toBuffer();
}

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function walkMarkdownFiles(folder) {
  const files = [];

  if (!fs.existsSync(folder)) {
    return files;
  }

  for (const entry of fs.readdirSync(folder, {
    withFileTypes: true,
  })) {
    const fullPath = path.join(folder, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function readFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!match) {
    return null;
  }

  return YAML.parse(match[1]) || {};
}

function parseCoverPath(value) {
  if (!value) {
    return '';
  }

  return String(value)
    .replace(/^!\[\[/, '')
    .replace(/^\[\[/, '')
    .replace(/\]\]$/, '')
    .split('|')[0]
    .trim();
}

function findCoverFile(collectionFolder, coverValue) {
  const parsed = parseCoverPath(coverValue);

  if (!parsed) {
    return null;
  }

  /*
   * Frontmatter może zawierać pełną ścieżkę w Vault,
   * np. 11 - Collections/2 Euro/Covers/file.png.
   */
  const coversMarker = '/Covers/';
  const normalized = parsed.replace(/\\/g, '/');

  if (normalized.includes(coversMarker)) {
    const relativeToCollection = normalized.split(coversMarker)[1];

    const candidate = path.join(collectionFolder, 'Covers', relativeToCollection);

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  /*
   * Jeżeli cover zawiera tylko nazwę pliku.
   */
  const candidate = path.join(collectionFolder, 'Covers', path.basename(normalized));

  return fs.existsSync(candidate) ? candidate : null;
}

async function main() {
  const collectionFolder = process.argv[2];

  if (!collectionFolder) {
    fail('Usage: node scripts/build-starter-pack.js ' + '"/path/to/11 - Collections/2 Euro"');
  }

  const resolvedCollectionFolder = path.resolve(collectionFolder);

  const coinsFolder = path.join(resolvedCollectionFolder, 'Coins');

  if (!fs.existsSync(coinsFolder)) {
    fail(`Coins directory not found: ${coinsFolder}`);
  }

  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

  const markdownFiles = walkMarkdownFiles(coinsFolder);

  const exportedCoins = [];
  let skippedWithoutCover = 0;
  let skippedNotCustom = 0;
  let errors = 0;
  let originalBytes = 0;
  let encodedBytes = 0;

  for (const markdownFile of markdownFiles) {
    try {
      const frontmatter = readFrontmatter(markdownFile);

      if (!frontmatter) {
        continue;
      }

      if (frontmatter.own_cover !== true) {
        skippedNotCustom++;
        continue;
      }

      const coverFile = findCoverFile(resolvedCollectionFolder, frontmatter.cover);

      if (!coverFile) {
        skippedWithoutCover++;

        console.warn(`Cover not found: ${markdownFile}`);

        continue;
      }

      const originalBuffer = fs.readFileSync(coverFile);
      const coverBuffer = await encodeCover(originalBuffer);
      originalBytes += originalBuffer.length;
      encodedBytes += coverBuffer.length;
      const coverFileName = `${path.basename(coverFile, path.extname(coverFile))}.webp`;

      exportedCoins.push({
        coin_id: frontmatter.coin_id || undefined,

        country: frontmatter.country || '',
        year: String(frontmatter.year || ''),
        coin_type: frontmatter.coin_type || 'commemorative',
        title: frontmatter.title || '',
        mint_mark: frontmatter.mint_mark || '',

        source: frontmatter.source || 'manual',

        numista_id: frontmatter.numista_id || undefined,

        numista_issue_id: frontmatter.numista_issue_id || undefined,

        numista_url: frontmatter.numista_url || undefined,

        mintage: frontmatter.mintage ?? undefined,

        official_issue: frontmatter.official_issue === true,

        object_type_id: frontmatter.object_type_id || undefined,

        object_type_name: frontmatter.object_type_name || undefined,

        photo_author: frontmatter.photo_author || undefined,

        photo_author_url: frontmatter.photo_author_url || undefined,

        photo_license: frontmatter.photo_license || undefined,

        photo_license_url: frontmatter.photo_license_url || undefined,

        numismatic_value_currency: frontmatter.numismatic_value_currency || undefined,

        numismatic_values: Array.isArray(frontmatter.numismatic_values)
          ? frontmatter.numismatic_values
          : undefined,

        numismatic_value_unc: frontmatter.numismatic_value_unc ?? undefined,

        /*
         * Dane użytkownika są celowo zerowane.
         */
        owned: false,
        quantity: 1,

        /*
         * Dołączona okładka ma być chroniona.
         */
        reference_year: String(frontmatter.reference_year || frontmatter.year || ''),

        cover_locked: true,
        own_cover: true,

        cover: {
          fileName: coverFileName,
          mimeType: 'image/webp',
          base64: coverBuffer.toString('base64'),
        },
      });
    } catch (error) {
      errors++;

      console.error(`Cannot export ${markdownFile}`, error);
    }
  }

  exportedCoins.sort((a, b) => {
    const country = String(a.country).localeCompare(String(b.country), 'en');

    if (country !== 0) {
      return country;
    }

    const year = Number(a.year || 0) - Number(b.year || 0);

    if (year !== 0) {
      return year;
    }

    return String(a.title).localeCompare(String(b.title), 'en');
  });

  const starterPack = {
    schemaVersion: 1,
    pluginVersion: manifest.version,
    generatedAt: new Date().toISOString(),
    coinCount: exportedCoins.length,
    coins: exportedCoins,
  };

  fs.mkdirSync('StarterData', {
    recursive: true,
  });

  fs.writeFileSync(
    'StarterData/starter-pack.json',
    `${JSON.stringify(starterPack, null, 2)}\n`,
    'utf8'
  );

  console.log('');
  console.log('Starter pack generated.');
  console.log(`Exported coins: ${exportedCoins.length}`);
  console.log(`Skipped without custom cover: ${skippedNotCustom}`);
  console.log(`Skipped because cover was missing: ${skippedWithoutCover}`);
  console.log(`Errors: ${errors}`);
  console.log(
    `Covers: ${(originalBytes / 1e6).toFixed(1)} MB -> ${(encodedBytes / 1e6).toFixed(1)} MB (WebP, max ${COVER_MAX_SIZE} px)`
  );
  console.log('');
  console.log('Output: StarterData/starter-pack.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
