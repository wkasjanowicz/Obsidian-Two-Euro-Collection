import { TFile, stringifyYaml } from 'obsidian';
import { clean } from '../utils.js';

/*
 * A ready-made Obsidian Bases file (.base) for the coin notes: a gallery of
 * covers and tables of all, missing, owned and swap coins. Bases reads the
 * note properties directly, so the views can be sorted, filtered and edited
 * in Obsidian without the plugin's dashboard.
 */

/* Coin note properties shown in the tables, in this order. */
const TABLE_COLUMNS = [
  'country',
  'year',
  'title',
  'mint_mark',
  'coin_type',
  'owned',
  'quantity',
  'condition',
  'acquisition_date',
  'acquisition_price',
  'numismatic_value_unc',
];

/* Display names: property -> translation key. */
const LABELS = {
  country: 'coin.country',
  year: 'coin.year',
  title: 'coin.title',
  mint_mark: 'coin.mint',
  coin_type: 'coin.type',
  owned: 'bases.owned',
  quantity: 'coin.quantity',
  condition: 'coin.condition',
  acquisition_date: 'coin.date',
  acquisition_price: 'coin.price',
  numismatic_value_unc: 'bases.valueUnc',
  cover: 'bases.cover',
};

/** @satisfies {ThisType<import('../types').TwoEuroPlugin>} */
export const basesMethods = {
  /** Path of the .base file, next to the dashboard note. */
  basesPath() {
    return this.join(this.root(), `${clean(this.t('bases.fileName')) || '2 Euro'}.base`);
  },

  /**
   * Contents of the .base file (see https://help.obsidian.md/bases/syntax).
   * @returns {Record<string, unknown>}
   */
  buildBasesConfig() {
    const t = (/** @type {string} */ key) => this.t(key);
    const byCountryAndYear = [
      { property: 'country', direction: 'ASC' },
      { property: 'year', direction: 'ASC' },
    ];
    /**
     * @param {string} name
     * @param {string[]} [filters]
     */
    const table = (name, filters = []) => ({
      type: 'table',
      name,
      ...(filters.length ? { filters: { and: filters } } : {}),
      order: TABLE_COLUMNS,
      sort: byCountryAndYear,
    });
    return {
      filters: {
        and: [`file.inFolder(${JSON.stringify(this.coins())})`, 'file.ext == "md"'],
      },
      properties: Object.fromEntries(
        Object.entries(LABELS).map(([property, key]) => [property, { displayName: t(key) }])
      ),
      views: [
        {
          type: 'cards',
          name: t('bases.viewGallery'),
          order: ['country', 'year', 'title', 'mint_mark', 'owned'],
          sort: byCountryAndYear,
          image: 'note.cover',
          imageFit: 'contain',
        },
        table(t('bases.viewAll')),
        table(t('bases.viewMissing'), ['owned != true']),
        table(t('bases.viewOwned'), ['owned == true']),
        table(t('bases.viewSwap'), ['owned == true', 'quantity > 1']),
      ],
    };
  },

  /**
   * Opens the collection in Bases, creating the .base file when it does not
   * exist. With recreate, an existing file is replaced after confirmation
   * (changes made to it in Obsidian are lost).
   * @param {{ recreate?: boolean }} [options]
   * @returns {Promise<TFile | null>}
   */
  async openBasesView({ recreate = false } = {}) {
    await this.ensureStructure();
    const path = this.basesPath();
    const content = stringifyYaml(this.buildBasesConfig());
    let file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      if (recreate) {
        if (!(await this.confirm(this.t('confirm.recreateBases'), { warning: true }))) return null;
        await this.app.vault.modify(file, content);
      }
    } else {
      file = await this.app.vault.create(path, content);
    }
    if (!(file instanceof TFile)) return null;
    await this.app.workspace.getLeaf(true).openFile(file);
    return file;
  },
};
