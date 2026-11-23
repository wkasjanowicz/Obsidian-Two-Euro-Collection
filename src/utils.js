export function formatText(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`
  );
}

export const tx = (v) => (v == null ? '' : String(v).trim());

export const clean = (v) =>
  tx(v)
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();

export const isTrue = (v) => v === true || String(v).toLowerCase() === 'true';

export const toNum = (v) => {
  const s = tx(v).replace(/\s+/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function normalizeCoinTitle(value) {
  const title = tx(value).replace(/\s+/g, ' ').trim();
  return title.replace(/^2\s*Euros?\b\.?/i, '2 Euro');
}

/*
 * Identity of a coin independent of Numista ids: country, year, title and mint.
 * Punctuation and case are ignored ("Notre-Dame" = "Notre Dame").
 */
export function coinIdentityKey(row) {
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

export function countryName(v) {
  const x = tx(v),
    k = x.toLowerCase();
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
