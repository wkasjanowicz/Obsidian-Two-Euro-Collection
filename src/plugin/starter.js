import { Notice, requestUrl } from 'obsidian';
import { tx, clean, normalizeCoinTitle, countryName } from '../utils.js';

export const starterMethods = {
  async installStarterCollection() {
    const url =
      'https://raw.githubusercontent.com/' +
      'wkasjanowicz/Obsidian-Two-Euro-Collection/' +
      'main/StarterData/starter-pack.json';

    const response = await requestUrl({
      url,
      headers: {
        accept: 'application/json',
      },
    });

    if (response.status >= 400) {
      throw new Error(`Starter collection HTTP ${response.status}`);
    }

    const starterPack = response.json || JSON.parse(response.text || '{}');

    if (starterPack.schemaVersion !== 1 || !Array.isArray(starterPack.coins)) {
      throw new Error(this.t('error.starterFormat'));
    }

    await this.ensureStructure();

    const existingRows = this.getRows();

    /*
     * Podstawowym identyfikatorem monety jest:
     *
     * numista_id + numista_issue_id
     *
     * Dzięki temu ponowne uruchomienie importu
     * nie powinno tworzyć duplikatów.
     */
    const existingNumistaKeys = new Set(
      existingRows
        .filter((row) => row.numista_id && row.numista_issue_id)
        .map((row) => `${row.numista_id}:${row.numista_issue_id}`)
    );

    /*
     * Fallback dla monet bez identyfikatorów Numista.
     */
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
         * Istniejącej monety nie modyfikujemy.
         *
         * To chroni:
         * - owned
         * - quantity
         * - acquisition data
         * - notes
         * - okładkę użytkownika
         */
        if (
          (numistaKey && existingNumistaKeys.has(numistaKey)) ||
          existingFallbackKeys.has(fallbackKey)
        ) {
          skipped++;
          continue;
        }

        let coverPath = '';

        /*
         * Odtworzenie lokalnego pliku obrazu
         * z Base64 znajdującego się w starter-pack.json.
         */
        if (coin.cover?.fileName && coin.cover?.base64) {
          const safeFileName = clean(coin.cover.fileName);

          if (!safeFileName) {
            throw new Error('Invalid starter cover filename.');
          }

          coverPath = this.join(this.covers(), safeFileName);

          /*
           * Nie nadpisujemy istniejącego pliku.
           */
          if (await this.app.vault.adapter.exists(coverPath)) {
            coverPath = await this.uniqueCoverPath(coverPath);
          }

          const binary = atob(coin.cover.base64);

          const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

          await this.app.vault.adapter.writeBinary(coverPath, bytes);
        }

        /*
         * Dane użytkownika zawsze zaczynają się
         * od neutralnego stanu.
         */
        const data = {
          ...coin,

          owned: false,
          quantity: 1,

          acquisition_date: '',
          acquisition_price: null,
          acquisition_currency: '',
          condition: '',
          notes: '',

          cover_path: coverPath,

          /*
           * Okładka pochodząca ze starter packa
           * ma być chroniona przed synchronizacją
           * z Numista.
           */
          cover_locked: Boolean(coverPath),
          own_cover: Boolean(coverPath),
        };

        /*
         * Pole coin.cover w starter-pack.json
         * jest obiektem zawierającym Base64.
         *
         * upsert() oczekuje natomiast ścieżki
         * przez cover_path, więc nie przekazujemy
         * obiektu jako zwykłego pola cover.
         */
        delete data.cover;

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

    /*
     * Dane w Vault zostały zmienione,
     * więc odświeżamy oba widoki.
     */
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
