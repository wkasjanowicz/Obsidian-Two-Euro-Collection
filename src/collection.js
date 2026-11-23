/*
 * Pure helpers for collection views: sorting, grouping, statistics and export.
 * They work on plain row objects (see getRows) and do not touch Obsidian,
 * so they are covered directly by tests.
 */

const compareText = (a, b, locale) =>
  String(a || '').localeCompare(String(b || ''), locale, { numeric: true, sensitivity: 'base' });

export function sortRows(list, sortMode = 'yearAsc', locale = 'en') {
  return [...list].sort((a, b) => {
    const yearA = Number(a.year) || 0,
      yearB = Number(b.year) || 0,
      countryCmp = compareText(a.country, b.country, locale),
      titleCmp = compareText(a.title, b.title, locale),
      mintCmp = compareText(a.mint_mark, b.mint_mark, locale);
    if (sortMode === 'yearDesc') return yearB - yearA || countryCmp || titleCmp || mintCmp;
    if (sortMode === 'countryAsc') return countryCmp || yearA - yearB || titleCmp || mintCmp;
    if (sortMode === 'countryDesc') return -countryCmp || yearA - yearB || titleCmp || mintCmp;
    return yearA - yearB || countryCmp || titleCmp || mintCmp;
  });
}

const progress = (rows) => ({
  owned: rows.filter((row) => row.owned).length,
  total: rows.length,
});

/*
 * Splits sorted rows into groups by country or year. Group order follows the
 * sort direction (descending sort -> descending groups).
 */
export function groupRows(sortedRows, groupBy = 'none', sortMode = 'yearAsc', locale = 'en') {
  if (groupBy !== 'country' && groupBy !== 'year')
    return [{ key: '', label: '', rows: sortedRows, ...progress(sortedRows) }];
  const groups = new Map();
  for (const row of sortedRows) {
    const key = groupBy === 'country' ? String(row.country || '') : String(row.year || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const keys = [...groups.keys()];
  if (groupBy === 'year') {
    keys.sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
    if (sortMode === 'yearDesc') keys.reverse();
  } else {
    keys.sort((a, b) => compareText(a, b, locale));
    if (sortMode === 'countryDesc') keys.reverse();
  }
  return keys.map((key) => ({
    key,
    label: key,
    rows: groups.get(key),
    ...progress(groups.get(key)),
  }));
}

const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

const addAmount = (map, currency, amount) => map.set(currency, (map.get(currency) || 0) + amount);

const amounts = (map) =>
  [...map.entries()]
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);

const breakdown = (rows, keyOf, compare) => {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .map(([key, items]) => ({ key, ...progress(items) }))
    .sort((a, b) => compare(a.key, b.key));
};

/*
 * Statistics for a list of coins:
 * - progress overall, by country and by year,
 * - collection value from Numista UNC prices (owned coins x quantity),
 * - money spent on purchases (acquisition_price of owned coins),
 * - coins available for swap (quantity above 1).
 */
export function computeStats(rows, locale = 'en') {
  const owned = rows.filter((row) => row.owned);
  const value = new Map(),
    spent = new Map();
  let valueMissing = 0,
    spentMissing = 0,
    swapCoins = 0,
    swapPieces = 0;
  for (const row of owned) {
    const quantity = Math.max(1, Number(row.quantity) || 1);
    const unc = finite(row.numismatic_value_unc);
    if (unc === null) valueMissing++;
    else addAmount(value, row.numismatic_value_currency || 'EUR', unc * quantity);
    const price = finite(row.acquisition_price);
    if (price === null) spentMissing++;
    else addAmount(spent, row.acquisition_currency || '', price);
    if (quantity > 1) {
      swapCoins++;
      swapPieces += quantity - 1;
    }
  }
  return {
    ...progress(rows),
    byCountry: breakdown(
      rows,
      (row) => String(row.country || ''),
      (a, b) => compareText(a, b, locale)
    ),
    byYear: breakdown(
      rows,
      (row) => String(row.year || ''),
      (a, b) => (Number(a) || 0) - (Number(b) || 0)
    ),
    value: amounts(value),
    valueMissing,
    spent: amounts(spent),
    spentMissing,
    swapCoins,
    swapPieces,
  };
}

export function formatMoney(amount, currency, locale = 'en') {
  const code = String(currency || '')
    .trim()
    .toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(amount);
    } catch {
      // Unknown currency code: fall through to the plain format.
    }
  }
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return code ? `${number} ${currency}` : number;
}

/* RFC 4180 CSV; values containing a separator, quote or newline are quoted. */
export function toCsv(header, records) {
  const cell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...records].map((record) => record.map(cell).join(',')).join('\r\n') + '\r\n';
}
