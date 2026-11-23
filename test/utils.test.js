'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('utils', async (t) => {
  const { toNum, normalizeCoinTitle, countryName, coinIdentityKey, formatText } =
    await import('../src/utils.js');

  await t.test('toNum treats empty values as missing, not 0', () => {
    assert.equal(toNum(''), null);
    assert.equal(toNum(undefined), null);
    assert.equal(toNum('12,50'), 12.5);
    assert.equal(toNum('1 234,5'), 1234.5);
    assert.equal(toNum('abc'), null);
  });

  await t.test('normalizeCoinTitle unifies the "2 Euro" prefix', () => {
    assert.equal(normalizeCoinTitle('2 Euros (Louvre Museum)'), '2 Euro (Louvre Museum)');
    assert.equal(normalizeCoinTitle('2  euros.'), '2 Euro');
  });

  await t.test('countryName maps Numista issuer names', () => {
    assert.equal(countryName('Germany, Federal Republic of'), 'Germany');
    assert.equal(countryName('Vatican City'), 'Vatican');
    assert.equal(countryName('Republic of Latvia'), 'Latvia');
  });

  await t.test('coinIdentityKey ignores case, punctuation and accents', () => {
    const a = { country: 'France', year: '2025', title: '2 Euro (Notre-Dame de Paris)' };
    const b = { country: 'France', year: 2025, title: '2 Euros (Notre Dame de Paris)' };
    assert.equal(coinIdentityKey(a), coinIdentityKey(b));
    assert.notEqual(coinIdentityKey(a), coinIdentityKey({ ...b, mint_mark: 'A' }));
  });

  await t.test('formatText fills placeholders and keeps unknown ones', () => {
    assert.equal(formatText('{a} / {b}', { a: 1 }), '1 / {b}');
  });
});
