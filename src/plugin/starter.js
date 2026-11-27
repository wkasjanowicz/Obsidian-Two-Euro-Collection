import { Notice, requestUrl } from 'obsidian';
import { GITHUB_REPO } from '../constants.js';
import { tx, clean, normalizeCoinTitle, countryName, parseJson } from '../utils.js';

/**
 * A starter-pack coin without its cover. coin.cover in starter-pack.json is an
 * object with Base64 data, while upsert() expects a path in cover_path.
 * @param {import('../types').StarterCoin} coin
 * @returns {Omit<import('../types').StarterCoin, 'cover'>}
 */
const withoutCover = (coin) => {
  const copy = { ...coin };
  delete copy.cover;
  return copy;
};

/** @satisfies {ThisType<import('../types').TwoEuroPlugin>} */
export const starterMethods = {
  async installStarterCollection() {
    /*
     * The starter pack lives on the separate "starter-pack" branch of the
     * repository (published with npm run starter-pack:publish), so it is not
     * part of plugin releases and does not grow the main branch history.
     * The old location on main is kept as a fallback.
     */
    const urls = [
      `https://raw.githubusercontent.com/${GITHUB_REPO}/starter-pack/starter-pack.json`,
      `https://raw.githubusercontent.com/${GITHUB_REPO}/main/StarterData/starter-pack.json`,
    ];
    /** @type {import('obsidian').RequestUrlResponse | null} */
    let response = null,
      /** @type {unknown} */
      lastError = null;
    for (const url of urls) {
      try {
        response = await requestUrl({ url, headers: { accept: 'application/json' } });
        if (response.status < 400) break;
        lastError = new Error(`Starter collection HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      response = null;
    }
    if (!response) throw lastError || new Error('Starter collection unavailable');

    /** @type {unknown} */
    const json = response.json;
    const starterPack = /** @type {import('../types').StarterPack} */ (
      json || parseJson(response.text || '{}')
    );

    if (starterPack.schemaVersion !== 1 || !Array.isArray(starterPack.coins)) {
      throw new Error(this.t('error.starterFormat'));
    }

    await this.ensureStructure();

    const existingRows = this.getRows();

    /*
     * A coin is identified by numista_id + numista_issue_id, so running the
     * import again does not create duplicates.
     */
    const existingNumistaKeys = new Set(
      existingRows
        .filter((row) => row.numista_id && row.numista_issue_id)
        .map((row) => `${row.numista_id}:${row.numista_issue_id}`)
    );

    /* Fallback key for coins without Numista ids. */
    /** @param {import('../types').StarterCoin | import('../types').CoinRow} coin */
    const getFallbackKey = (coin) =>
      [
        countryName(coin.country),
        tx(coin.year),
        tx(coin.coin_type),
        normalizeCoinTitle(coin.title),
        tx(coin.mint_mark),
      ]
        .map((value) => String(value).toLowerCase())
        .join('|');

    const existingFallbackKeys = new Set(existingRows.map(getFallbackKey));

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const coin of starterPack.coins) {
      try {
        const numistaKey =
          coin.numista_id && coin.numista_issue_id
            ? `${coin.numista_id}:${coin.numista_issue_id}`
            : '';

        const fallbackKey = getFallbackKey(coin);

        /*
         * An existing coin is never modified. This keeps the user's owned flag,
         * quantity, acquisition data, notes and own cover.
         */
        if (
          (numistaKey && existingNumistaKeys.has(numistaKey)) ||
          existingFallbackKeys.has(fallbackKey)
        ) {
          skipped++;
          continue;
        }

        let coverPath = '';

        /* Recreates the local image file from the Base64 data in starter-pack.json. */
        if (coin.cover?.fileName && coin.cover?.base64) {
          const safeFileName = clean(coin.cover.fileName);

          if (!safeFileName) {
            throw new Error('Invalid starter cover filename.');
          }

          coverPath = this.join(this.covers(), safeFileName);

          /* An existing file is never overwritten. */
          if (await this.app.vault.adapter.exists(coverPath)) {
            coverPath = await this.uniqueCoverPath(coverPath);
          }

          const binary = atob(coin.cover.base64);

          const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

          await this.app.vault.adapter.writeBinary(coverPath, bytes.buffer);
        }

        /* User data always starts from a neutral state. */
        /** @type {import('../types').CoinData} */
        const data = {
          ...withoutCover(coin),

          owned: false,
          quantity: 1,

          acquisition_date: '',
          acquisition_price: null,
          acquisition_currency: '',
          condition: '',
          notes: '',

          cover_path: coverPath,

          /* A cover from the starter pack is protected from Numista synchronization. */
          cover_locked: Boolean(coverPath),
          own_cover: Boolean(coverPath),
        };

        await this.upsert(data, null);

        if (numistaKey) {
          existingNumistaKeys.add(numistaKey);
        }

        existingFallbackKeys.add(fallbackKey);

        created++;
      } catch (error) {
        errors++;

        console.error(
          'Starter collection import',
          {
            country: coin?.country,
            year: coin?.year,
            title: coin?.title,
            numista_id: coin?.numista_id,
            numista_issue_id: coin?.numista_issue_id,
          },
          error
        );
      }
    }

    /* The vault changed, so both views are refreshed. */
    await this.refreshDashboards();
    this.refreshFilterViews();

    new Notice(
      this.t('notice.starterInstalled', {
        created,
        skipped,
        errors,
      })
    );

    return {
      created,
      skipped,
      errors,
    };
  },
};
