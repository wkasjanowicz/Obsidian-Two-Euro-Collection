/*
 * Pure helpers for collection views: sorting, grouping, statistics and export.
 * They work on plain row objects (see getRows) and do not touch Obsidian,
 * so they are covered directly by tests.
 */

import { tx, asText } from './utils.js';

/**
 * @param {string} a
 * @param {string} b
 * @param {string} locale
 */
const compareText = (a, b, locale) =>
  tx(a).localeCompare(tx(b), locale, { numeric: true, sensitivity: 'base' });

/**
 * @template {import('./types').CoinRow} T
 * @param {T[]} list
 * @param {string} [sortMode]
 * @param {string} [locale]
 * @returns {T[]}
 */
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

/** @param {import('./types').CoinRow[]} rows */
const progress = (rows) => ({
  owned: rows.filter((row) => row.owned).length,
  total: rows.length,
});

/*
 * Splits sorted rows into groups by country or year. Group order follows the
 * sort direction (descending sort -> descending groups).
 */
/**
 * @template {import('./types').CoinRow} T
 * @param {T[]} sortedRows
 * @param {string} [groupBy]
 * @param {string} [sortMode]
 * @param {string} [locale]
 * @returns {{ key: string, label: string, rows: T[], owned: number, total: number }[]}
 */
export function groupRows(sortedRows, groupBy = 'none', sortMode = 'yearAsc', locale = 'en') {
  if (groupBy !== 'country' && groupBy !== 'year')
    return [{ key: '', label: '', rows: sortedRows, ...progress(sortedRows) }];
  /** @type {Map<string, T[]>} */
  const groups = new Map();
  for (const row of sortedRows) {
    const key = groupBy === 'country' ? tx(row.country) : tx(row.year);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(row);
  }
  const keys = [...groups.keys()];
  if (groupBy === 'year') {
    keys.sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
    if (sortMode === 'yearDesc') keys.reverse();
  } else {
    keys.sort((a, b) => compareText(a, b, locale));
    if (sortMode === 'countryDesc') keys.reverse();
  }
  return keys.map((key) => {
    const rows = groups.get(key) || [];
    return { key, label: key, rows, ...progress(rows) };
  });
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(tx(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

/**
 * @param {Map<string, number>} map
 * @param {string} currency
 * @param {number} amount
 */
const addAmount = (map, currency, amount) => map.set(currency, (map.get(currency) || 0) + amount);

/**
 * @param {Map<string, number>} map
 * @returns {import('./types').Amount[]}
 */
const amounts = (map) =>
  [...map.entries()]
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);

/**
 * @param {import('./types').CoinRow[]} rows
 * @param {(row: import('./types').CoinRow) => string} keyOf
 * @param {(a: string, b: string) => number} compare
 */
const breakdown = (rows, keyOf, compare) => {
  /** @type {Map<string, import('./types').CoinRow[]>} */
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(row);
  }
  return [...groups.entries()]
    .map(([key, items]) => ({ key, ...progress(items) }))
    .sort((a, b) => compare(a.key, b.key));
};

/*
 * Statistics for a list of coins:
 * - progress overall, by country and by year,
 * - collection value from Numista UNC prices (owned coins x quantity),
 * - money spent on purchases (acquisition_price per piece x quantity),
 * - coins available for swap (quantity above 1).
 */
/**
 * @param {import('./types').CoinRow[]} rows
 * @param {string} [locale]
 */
export function computeStats(rows, locale = 'en') {
  const owned = rows.filter((row) => row.owned);
  /** @type {Map<string, number>} */
  const value = new Map(),
    /** @type {Map<string, number>} */
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
    // acquisition_price is the price of one piece
    const price = finite(row.acquisition_price);
    if (price === null) spentMissing++;
    else addAmount(spent, row.acquisition_currency || '', price * quantity);
    if (quantity > 1) {
      swapCoins++;
      swapPieces += quantity - 1;
    }
  }
  return {
    ...progress(rows),
    byCountry: breakdown(
      rows,
      (row) => tx(row.country),
      (a, b) => compareText(a, b, locale)
    ),
    byYear: breakdown(
      rows,
      (row) => tx(row.year),
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

/**
 * @param {number} amount
 * @param {string} currency
 * @param {string} [locale]
 * @returns {string}
 */
export function formatMoney(amount, currency, locale = 'en') {
  const code = tx(currency).toUpperCase();
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
/**
 * @param {string[]} header
 * @param {unknown[][]} records
 * @returns {string}
 */
export function toCsv(header, records) {
  /** @param {unknown} value */
  const cell = (value) => {
    const text = asText(value);
    return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...records].map((record) => record.map(cell).join(',')).join('\r\n') + '\r\n';
}

/*
 * Adds today's snapshot to the value history (one entry per day, newest last).
 */
/**
 * @param {unknown} history
 * @param {{ owned: number, total: number, value: import('./types').Amount[], spent: import('./types').Amount[] }} stats
 * @param {string} date
 * @param {number} [limit]
 * @returns {import('./types').ValueSnapshot[]}
 */
export function addValueSnapshot(history, stats, date, limit = 120) {
  /** @type {import('./types').ValueSnapshot} */
  const entry = {
    date,
    owned: stats.owned,
    total: stats.total,
    value: stats.value,
    spent: stats.spent,
  };
  /** @type {import('./types').ValueSnapshot[]} */
  const list = Array.isArray(history) ? history : [];
  const next = list.filter((item) => item.date !== date);
  next.push(entry);
  next.sort((a, b) => tx(a.date).localeCompare(tx(b.date)));
  return next.slice(-limit);
}
