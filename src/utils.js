/**
 * @param {unknown} template
 * @param {Record<string, unknown>} [vars]
 * @returns {string}
 */
export function formatText(template, vars = {}) {
  return asText(template).replace(/\{(\w+)\}/g, (_, /** @type {string} */ k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? asText(vars[k]) : `{${k}}`
  );
}

/**
 * Any value as text, like String() but without '[object Object]' surprises
 * for the types the plugin handles ('' for null and undefined).
 * @param {unknown} v
 * @returns {string}
 */
export function asText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (Array.isArray(v)) return v.map(asText).join(',');
  if (v instanceof Error || v instanceof Date) return String(v);
  return typeof v === 'function' ? '[object Function]' : '[object Object]';
}

/**
 * JSON.parse without the implicit `any`: callers state the expected shape.
 * @param {string} text
 * @returns {unknown}
 */
export const parseJson = (text) => JSON.parse(text);

/**
 * A caught value as an error object, to read message, status or aborted.
 * The value itself is returned (rethrowing it keeps the original).
 * @param {unknown} error
 * @returns {import('./types').PluginError}
 */
export const asError = (error) =>
  /** @type {import('./types').PluginError} */ (
    error && typeof error === 'object' ? error : new Error(asText(error))
  );

/**
 * Message of a caught value, for notices.
 * @param {unknown} error
 * @returns {string}
 */
export const errorText = (error) => asError(error).message || asText(error);

/**
 * Any value as trimmed text ('' for null and undefined).
 * @param {unknown} v
 * @returns {string}
 */
export const tx = (v) => asText(v).trim();

/**
 * @param {unknown} v
 * @returns {string}
 */
export const clean = (v) =>
  tx(v)
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();

/**
 * @param {unknown} v
 * @returns {boolean}
 */
export const isTrue = (v) => v === true || tx(v).toLowerCase() === 'true';

/**
 * @param {unknown} v
 * @returns {number | null}
 */
export const toNum = (v) => {
  const s = tx(v).replace(/\s+/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeCoinTitle(value) {
  const title = tx(value).replace(/\s+/g, ' ').trim();
  return title.replace(/^2\s*Euros?\b\.?/i, '2 Euro');
}

/*
 * Identity of a coin independent of Numista ids: country, year, title and mint.
 * Punctuation and case are ignored ("Notre-Dame" = "Notre Dame").
 */
/**
 * @param {{ country?: unknown, year?: unknown, title?: unknown, mint_mark?: unknown } | null | undefined} row
 * @returns {string}
 */
export function coinIdentityKey(row) {
  /** @param {unknown} value */
  const simplify = (value) =>
    tx(value)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return [
    simplify(countryName(row?.country)),
    simplify(row?.year),
    simplify(normalizeCoinTitle(row?.title)),
    simplify(row?.mint_mark),
  ].join('|');
}

/**
 * @param {unknown} v
 * @returns {string}
 */
export function countryName(v) {
  const x = tx(v),
    k = x.toLowerCase();
  /** @type {Record<string, string>} */
  const m = {
    'germany, federal republic of': 'Germany',
    'germany, federal republic': 'Germany',
    'federal republic of germany': 'Germany',
    germany: 'Germany',
    'vatican city state': 'Vatican',
    'vatican city': 'Vatican',
    'vatican city, state of': 'Vatican',
    'holy see (vatican city state)': 'Vatican',
    'holy see': 'Vatican',
    'principality of andorra': 'Andorra',
    'principality of monaco': 'Monaco',
    'republic of san marino': 'San Marino',
    'republic of austria': 'Austria',
    'kingdom of belgium': 'Belgium',
    'republic of cyprus': 'Cyprus',
    'republic of estonia': 'Estonia',
    'republic of finland': 'Finland',
    'french republic': 'France',
    'hellenic republic': 'Greece',
    'republic of ireland': 'Ireland',
    'italian republic': 'Italy',
    'republic of latvia': 'Latvia',
    'republic of lithuania': 'Lithuania',
    'grand duchy of luxembourg': 'Luxembourg',
    'republic of malta': 'Malta',
    'kingdom of the netherlands': 'Netherlands',
    'portuguese republic': 'Portugal',
    'slovak republic': 'Slovakia',
    'republic of slovenia': 'Slovenia',
    'kingdom of spain': 'Spain',
  };
  return m[k] || x.replace(/^(Republic of|Kingdom of|Principality of|Grand Duchy of)\s+/i, '');
}
