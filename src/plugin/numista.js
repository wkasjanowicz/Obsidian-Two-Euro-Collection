import { Notice, TFile, requestUrl } from 'obsidian';
import { DEFAULT_REFERENCE_ISSUERS } from '../constants.js';
import { tx, clean, isTrue, normalizeCoinTitle, coinIdentityKey, countryName } from '../utils.js';

export const numistaMethods = {
  async waitForRequestSlot(minIntervalMs = 1250) {
    const now = Date.now(),
      wait = Math.max(0, (this._lastRequestAt || 0) + minIntervalMs - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this._lastRequestAt = Date.now();
  },

  async requestWithRetry(options, config = {}) {
    const minIntervalMs = config.minIntervalMs || 1250,
      maxAttempts = config.maxAttempts || 5,
      label = config.label || 'Numista';
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.waitForRequestSlot(minIntervalMs);
      try {
        return await requestUrl(options);
      } catch (error) {
        lastError = error;
        const match = String(error?.message || '').match(/status\s+(\d+)/i),
          status = Number(error?.status || error?.response?.status || (match && match[1]) || 0);
        if (status !== 429 || attempt === maxAttempts) throw error;
        const delayMs =
          Math.min(60000, 5000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 1000);
        console.warn(`${label}: HTTP 429; ponowienie po ${delayMs} ms`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastError;
  },

  isNumistaAuthError(error) {
    return Boolean(error?.numistaAuth);
  },

  async api(path) {
    let r;
    try {
      r = await this.requestWithRetry(
        {
          url: `https://api.numista.com/v3${path}`,
          headers: {
            'Numista-API-Key': tx(this.settings.numistaApiKey),
            accept: 'application/json',
          },
        },
        { minIntervalMs: 1250, maxAttempts: 5, label: 'Numista API' }
      );
    } catch (error) {
      const match = String(error?.message || '').match(/status\s+(\d+)/i),
        status = Number(error?.status || (match && match[1]) || 0);
      if (status === 401 || status === 403) {
        const authError = new Error(this.t('error.numistaAuth', { status }));
        authError.status = status;
        authError.numistaAuth = true;
        throw authError;
      }
      throw error;
    }
    if (r.status >= 400) throw new Error(`Numista HTTP ${r.status}`);
    return r.json || JSON.parse(r.text || '{}');
  },

  extractImage(v) {
    if (!v) return '';
    if (typeof v === 'string') return /^https?:/i.test(v) ? v : '';
    if (Array.isArray(v)) {
      for (const x of v) {
        const u = this.extractImage(x);
        if (u) return u;
      }
    } else if (typeof v === 'object') {
      for (const k of ['picture', 'image', 'url', 'uri', 'full', 'large', 'thumbnail', 'preview']) {
        const u = this.extractImage(v[k]);
        if (u) return u;
      }
    }
    return '';
  },

  pickImage(d) {
    return (
      this.extractImage(d && d.obverse) ||
      this.extractImage(d && d.pictures) ||
      this.extractImage(d && d.images)
    );
  },

  isTwoEuro(d) {
    const numericValue = Number(d?.value?.numeric_value);

    const currencyName = tx(d?.value?.currency?.name).trim().toLowerCase();

    const currencyFullName = tx(d?.value?.currency?.full_name).trim().toLowerCase();

    const isEuroCurrency =
      currencyName === 'euro' ||
      currencyFullName === 'euro' ||
      currencyFullName.startsWith('euro (');

    return numericValue === 2 && isEuroCurrency;
  },

  async downloadCover(url, id, issue) {
    if (!/^https?:/i.test(url)) return '';
    await this.ensureFolder(this.covers());
    const headers = { accept: 'image/*,*/*' };
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host === 'numista.com' || host.endsWith('.numista.com'))
        headers['Numista-API-Key'] = tx(this.settings.numistaApiKey);
    } catch {
      return '';
    }
    const r = await this.requestWithRetry(
      {
        url,
        headers,
      },
      { minIntervalMs: 1800, maxAttempts: 5, label: 'Numista cover' }
    );
    if (r.status >= 400) throw new Error(`Cover HTTP ${r.status}`);
    const ct = tx(r.headers?.['content-type'] || r.headers?.['Content-Type']).toLowerCase(),
      ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg',
      p = this.join(this.covers(), `numista-${clean(id)}-${clean(issue)}.${ext}`);
    await this.app.vault.adapter.writeBinary(p, new Uint8Array(r.arrayBuffer));
    return p;
  },

  photoMetadata(details) {
    const side = details?.obverse || {};
    return {
      photo_author: tx(side.picture_copyright),
      photo_author_url: tx(side.picture_copyright_url),
      photo_license: tx(side.picture_license_name),
      photo_license_url: tx(side.picture_license_url),
    };
  },

  async issueNumismaticValues(typeId, issueId) {
    if (!typeId || !issueId) return { currency: 'EUR', values: [], unc: null };
    try {
      const result = await this.api(
          `/types/${encodeURIComponent(typeId)}/issues/${encodeURIComponent(issueId)}/prices?currency=EUR&lang=en`
        ),
        prices = Array.isArray(result?.prices) ? result.prices : [],
        values = prices
          .filter((item) => item && item.price != null)
          .map((item) => ({ grade: tx(item.grade), price: Number(item.price) }))
          .filter((item) => Number.isFinite(item.price));
      const unc = values.find((item) => item.grade.toLowerCase() === 'unc')?.price ?? null;
      return { currency: tx(result?.currency) || 'EUR', values, unc };
    } catch (error) {
      if (this.isNumistaAuthError(error)) throw error;
      console.warn('Numista prices unavailable', typeId, issueId, error);
      return null;
    }
  },

  async updateNumistaPrices() {
    if (!tx(this.settings.numistaApiKey)) {
      new Notice(this.t('notice.apiKeyMissing'));
      return;
    }
    const rows = this.filterRowsByState(this.getRows(), this.getDashboardState()).filter(
      (row) => row.numista_id && row.numista_issue_id
    );
    if (!rows.length) {
      new Notice(this.t('notice.pricesNone'));
      return;
    }
    if (!window.confirm(this.t('confirm.updatePrices', { count: rows.length }))) return;
    let updated = 0,
      unchanged = 0,
      errors = 0;
    const progress = new Notice(
      this.t('notice.pricesProgress', { current: 0, total: rows.length, updated, errors }),
      0
    );
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        progress.setMessage(
          this.t('notice.pricesProgress', { current: i + 1, total: rows.length, updated, errors })
        );
        const valuation = await this.issueNumismaticValues(row.numista_id, row.numista_issue_id);
        if (!valuation) {
          errors++;
          continue;
        }
        const before = JSON.stringify([
          row.numismatic_value_currency || 'EUR',
          row.numismatic_values || [],
          row.numismatic_value_unc ?? null,
        ]);
        const after = JSON.stringify([valuation.currency, valuation.values, valuation.unc]);
        if (before === after || !valuation.values.length) {
          unchanged++;
          continue;
        }
        await this.app.fileManager.processFrontMatter(row.file, (fm) => {
          fm.numismatic_value_currency = valuation.currency;
          fm.numismatic_values = valuation.values;
          if (valuation.unc == null) delete fm.numismatic_value_unc;
          else fm.numismatic_value_unc = valuation.unc;
        });
        updated++;
      }
      progress.setMessage(this.t('notice.pricesDone', { updated, unchanged, errors }));
    } catch (error) {
      console.error('Numista prices', error);
      progress.setMessage(error?.message || String(error));
    }
    setTimeout(() => progress.hide(), 8000);
    return { updated, unchanged, errors };
  },

  isTypeAlreadyInCollection(basic, scope, localYears) {
    const years = localYears.get(tx(basic?.id));
    if (!years?.size) return false;
    if (scope.year) return years.has(String(scope.year));
    const min = Number(basic?.min_year),
      max = Number(basic?.max_year);
    if (Number.isInteger(min) && Number.isInteger(max) && max >= min && max - min < 100) {
      for (let year = min; year <= max; year++) if (!years.has(String(year))) return false;
    }
    return true;
  },

  officialEuroIssuers() {
    const builtIn =
      this.settings.referenceDataInitialized && this.settings.referenceIssuers?.length
        ? this.settings.referenceIssuers
        : DEFAULT_REFERENCE_ISSUERS;
    const additional = Array.isArray(this.settings.additionalIssuers)
      ? this.settings.additionalIssuers
      : [];
    return new Set([...builtIn, ...additional].map(countryName).filter(Boolean));
  },

  isOfficialTwoEuroType(details) {
    if (!this.isTwoEuro(details)) return false;
    const issuer = countryName(details?.issuer?.name),
      objectId = Number(details?.object_type?.id || 0),
      objectName = tx(details?.object_type?.name).toLowerCase();
    const officialObject =
      objectId === 1 ||
      objectId === 2 ||
      objectId === 3 ||
      objectName === 'standard circulation coins' ||
      objectName === 'circulating commemorative coins' ||
      objectName === 'non-circulating coins';
    if (!officialObject || !this.officialEuroIssuers().has(issuer)) return false;
    const haystack = [details?.title, details?.object_type?.name, details?.issuer?.name]
      .map(tx)
      .join(' ')
      .toLowerCase();
    return !/(medal|medallion|token|jeton|pattern|trial|probe|proba|essai|fantasy|fantaisie|private issue|souvenir|replica|copy)/i.test(
      haystack
    );
  },

  getNumistaSyncScope() {
    const state = this.getDashboardState();
    return {
      country: tx(state.country),
      year: tx(state.year),
      coinType: ['national', 'commemorative'].includes(state.mode) ? state.mode : '',
    };
  },

  matchesNumistaSyncCountry(numistaCountry, selectedCountry) {
    if (!selectedCountry) return true;
    const source = countryName(numistaCountry);
    const selected = countryName(selectedCountry);
    return source.localeCompare(selected, undefined, { sensitivity: 'base' }) === 0;
  },

  async getNumistaIssuerCode(country) {
    const selected = countryName(country);
    if (!selected) return '';
    try {
      if (!this._numistaIssuers) {
        const result = await this.api('/issuers?lang=en');
        this._numistaIssuers = Array.isArray(result?.issuers)
          ? result.issuers
          : Array.isArray(result)
            ? result
            : [];
      }
      const match = this._numistaIssuers.find(
        (issuer) => tx(issuer?.code) && this.matchesNumistaSyncCountry(issuer?.name, selected)
      );
      return match ? tx(match.code) : '';
    } catch (error) {
      if (this.isNumistaAuthError(error)) throw error;
      console.warn('Numista issuers unavailable', error);
      return '';
    }
  },

  async syncNumista(scope = null) {
    if (!tx(this.settings.numistaApiKey)) {
      new Notice(this.t('notice.apiKeyMissing'));
      return;
    }

    const syncScope = {
      country: tx(scope?.country),
      year: tx(scope?.year),
      coinType: tx(scope?.coinType),
    };

    const scopeLabels = [];

    if (syncScope.country) {
      scopeLabels.push(syncScope.country);
    }

    if (syncScope.year) {
      scopeLabels.push(syncScope.year);
    }

    if (syncScope.coinType) {
      scopeLabels.push(
        syncScope.coinType === 'commemorative'
          ? this.t('filter.commemorative')
          : this.t('filter.national')
      );
    }

    const filteredSync =
      Boolean(syncScope.country) || Boolean(syncScope.year) || Boolean(syncScope.coinType);

    const progress = new Notice(
      filteredSync
        ? this.t('notice.syncScope', { scope: scopeLabels.join(' / ') })
        : this.t('notice.syncOfficial'),
      0
    );

    const current = this.getRows();

    const by = new Map(
      current.map((row) => [[row.numista_id, row.year, row.mint_mark].join(':'), row])
    );

    const detailsCache = new Map();
    const issuesCache = new Map();
    const updateExisting = isTrue(this.settings.syncUpdateExisting);

    /*
     * numista_id -> years already in the collection. Used to skip types the
     * collection already has without spending Numista API requests.
     */
    const localYears = new Map();

    /*
     * Coins identified by country, year, title and mint. Catches coins added
     * manually (no numista_id) or under another Numista id, so synchronization
     * does not create duplicates of them.
     */
    const byIdentity = new Map(current.map((row) => [coinIdentityKey(row), row]));

    for (const row of current) {
      if (!row.numista_id) continue;
      if (!localYears.has(row.numista_id)) localYears.set(row.numista_id, new Set());
      localYears.get(row.numista_id).add(String(row.year));
    }

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    let existing = 0;
    let errors = 0;
    let processed = 0;
    const report = [];

    const objectTypes =
      syncScope.coinType === 'national'
        ? ['1']
        : syncScope.coinType === 'commemorative'
          ? ['2', '3']
          : ['1', '2', '3'];

    const pageSize = 50;
    let useServerFilters = true;

    try {
      const issuerCode = syncScope.country
        ? await this.getNumistaIssuerCode(syncScope.country)
        : '';

      for (const objectType of objectTypes) {
        let page = 1;

        while (true) {
          if (page > 200) {
            throw new Error(
              `Numista pagination safety limit exceeded for object type ${objectType}.`
            );
          }

          const q = new URLSearchParams({
            q: '2 Euros',
            object_type: objectType,
            page: String(page),
            count: String(pageSize),
            lang: 'en',
          });

          if (useServerFilters && syncScope.year) {
            q.set('year', String(syncScope.year));
          }

          if (useServerFilters && issuerCode) {
            q.set('issuer', issuerCode);
          }

          let listing;

          try {
            listing = await this.api(`/types?${q}`);
          } catch (error) {
            /*
             * If Numista rejects the server-side filters, fall back to the
             * unfiltered search. Country, year and type are still checked locally.
             */
            if (
              this.isNumistaAuthError(error) ||
              page !== 1 ||
              !useServerFilters ||
              !(q.has('year') || q.has('issuer'))
            ) {
              throw error;
            }

            console.warn('Numista rejected server-side filters, retrying without them', error);
            useServerFilters = false;
            q.delete('year');
            q.delete('issuer');
            listing = await this.api(`/types?${q}`);
          }

          const types = listing.types || [];

          if (!types.length) {
            break;
          }

          for (const basic of types) {
            processed++;

            const objectTypeLabel =
              objectType === '1' ? this.t('filter.national') : this.t('filter.commemorative');

            progress.setMessage(
              filteredSync
                ? this.t('notice.syncProgress', {
                    scope: scopeLabels.join(' / '),
                    type: objectTypeLabel,
                    count: processed,
                  })
                : this.t('notice.syncProgressAll', { type: objectTypeLabel, count: processed })
            );

            try {
              const id = tx(basic.id);
              const skip = (reason) => {
                skipped++;
                report.push({ id, title: tx(basic.title), reason });
              };

              if (!id) {
                skip('no id');
                continue;
              }

              if (!updateExisting && this.isTypeAlreadyInCollection(basic, syncScope, localYears)) {
                existing++;
                continue;
              }

              let d = detailsCache.get(id);

              if (!d) {
                d = await this.api(`/types/${encodeURIComponent(id)}?lang=en`);

                detailsCache.set(id, d);
              }

              /*
               * Najpierw odrzucamy elementy, które nie są oficjalnymi
               * emisjami 2 euro.
               */
              if (!this.isOfficialTwoEuroType(d)) {
                skip(
                  `not official 2 euro (issuer: ${tx(d.issuer?.name)}, type: ${tx(d.object_type?.name)}, value: ${tx(d.value?.text)})`
                );
                continue;
              }
              if (
                syncScope.country &&
                !this.matchesNumistaSyncCountry(d.issuer?.name, syncScope.country)
              ) {
                skip(`other country (${tx(d.issuer?.name)})`);
                continue;
              }

              /*
               * Ustalenie lokalnego typu monety.
               */
              const kind = tx(d.object_type?.name).toLowerCase();
              const objectTypeId = Number(d.object_type?.id);

              const coinType =
                objectTypeId === 2 ||
                objectTypeId === 3 ||
                kind.includes('commemorative') ||
                kind.includes('non-circulating') ||
                Boolean(tx(d.commemorated_topic))
                  ? 'commemorative'
                  : 'national';

              /*
               * Filtr typu stosujemy przed pobraniem listy emisji.
               */
              if (syncScope.coinType && coinType !== syncScope.coinType) {
                skip(`other type (${coinType})`);
                continue;
              }

              /*
               * Dopiero po sprawdzeniu kraju i typu pobieramy emisje.
               */
              let raw = issuesCache.get(id);

              if (!raw) {
                raw = await this.api(`/types/${encodeURIComponent(id)}/issues?lang=en`);

                issuesCache.set(id, raw);
              }

              const issues = Array.isArray(raw) ? raw : raw.issues || [];

              /*
               * Grupowanie po roku i mennicy. Jeśli Numista zwróci
               * więcej niż jeden rekord dla tej samej kombinacji,
               * pozostawiamy rekord z największym nakładem.
               */
              const uniq = new Map();

              for (const issueRow of issues) {
                const year = tx(issueRow.gregorian_year || issueRow.year);

                const mint = tx(issueRow.mint_letter);

                if (!Number(year)) {
                  continue;
                }

                /*
                 * Filtr roku można zastosować już tutaj, dzięki czemu
                 * niepotrzebne roczniki nie trafiają do uniq.
                 */
                if (syncScope.year && year !== syncScope.year) {
                  continue;
                }

                const key = `${year}|${mint}`;
                const previous = uniq.get(key);

                if (!previous || Number(issueRow.mintage || 0) > Number(previous.mintage || 0)) {
                  uniq.set(key, issueRow);
                }
              }

              /*
               * Jeśli po filtrowaniu roku nie została żadna emisja,
               * przechodzimy do kolejnego typu.
               */
              if (!uniq.size) {
                skip(
                  `no matching issues (Numista issues: ${issues.length}, years: ${
                    issues.map((item) => tx(item.gregorian_year || item.year)).join(', ') || '-'
                  })`
                );
                continue;
              }

              const sourceImage = this.pickImage(d);
              const photoMeta = this.photoMetadata(d);

              for (const issueRow of uniq.values()) {
                const issue = tx(issueRow.id);
                const year = tx(issueRow.gregorian_year || issueRow.year);
                const mint = tx(issueRow.mint_letter);

                const rowKey = [id, year, mint].join(':');

                const old = by.get(rowKey);

                if (old && !updateExisting) {
                  existing++;
                  continue;
                }

                if (!old) {
                  const twin = byIdentity.get(
                    coinIdentityKey({
                      country: d.issuer?.name,
                      year,
                      title: d.title,
                      mint_mark: mint,
                    })
                  );

                  if (twin) {
                    /*
                     * The coin already exists without this Numista id. Link
                     * it when it has no id yet; never create a duplicate.
                     */
                    if (!twin.numista_id && twin.file instanceof TFile) {
                      await this.app.fileManager.processFrontMatter(twin.file, (fm) => {
                        fm.numista_id = id;
                        fm.numista_issue_id = issue;
                        if (tx(d.url)) fm.numista_url = tx(d.url);
                      });
                      twin.numista_id = id;
                      twin.numista_issue_id = issue;
                    }
                    report.push({
                      id,
                      title: tx(d.title),
                      reason: `matched existing coin ${twin.file?.path || ''}`,
                    });
                    by.set(rowKey, twin);
                    existing++;
                    continue;
                  }
                }

                const data = {
                  ...(old || {}),

                  country: countryName(d.issuer?.name),
                  year,
                  title: normalizeCoinTitle(d.title),
                  coin_type: coinType,
                  mint_mark: mint,

                  source: 'numista',
                  numista_id: id,
                  numista_issue_id: issue,
                  numista_url: tx(d.url),

                  mintage: issueRow.mintage ?? null,

                  official_issue: true,
                  object_type_id: tx(d.object_type?.id),
                  object_type_name: tx(d.object_type?.name),

                  ...photoMeta,

                  /*
                   * Prices are not downloaded during synchronization
                   * (use "Update prices"), so existing values are kept.
                   */
                  numismatic_value_currency: old?.numismatic_value_currency,

                  numismatic_values: old?.numismatic_values,

                  numismatic_value_unc: old?.numismatic_value_unc,

                  cover: old?.cover,

                  cover_url: old?.cover_locked ? old?.cover_url : sourceImage || old?.cover_url,

                  reference_year: old?.reference_year,

                  cover_locked: old?.cover_locked || old?.own_cover || false,

                  own_cover: old?.own_cover || false,
                };

                if (old) {
                  const before = JSON.stringify([
                    old.country,
                    old.title,
                    old.coin_type,
                    old.numista_url,
                    old.mintage,
                    old.cover_url,
                    old.reference_year,
                    old.cover_locked,
                    old.photo_author,
                    old.photo_license,
                    old.numismatic_value_currency,
                    old.numismatic_values,
                    old.numismatic_value_unc,
                  ]);

                  const after = JSON.stringify([
                    data.country,
                    data.title,
                    data.coin_type,
                    data.numista_url,
                    data.mintage,
                    data.cover_url,
                    data.reference_year,
                    data.cover_locked,
                    data.photo_author,
                    data.photo_license,
                    data.numismatic_value_currency,
                    data.numismatic_values,
                    data.numismatic_value_unc,
                  ]);

                  if (before === after) {
                    unchanged++;
                    continue;
                  }

                  await this.upsert(data, old.file);

                  updated++;
                } else {
                  await this.upsert(data, null);

                  created++;
                }

                by.set(rowKey, {
                  ...data,
                  file: old?.file,
                });
              }
            } catch (error) {
              if (this.isNumistaAuthError(error)) throw error;

              errors++;
              report.push({
                id: tx(basic?.id),
                title: tx(basic?.title),
                reason: `error: ${error?.message || error}`,
              });

              console.error('Synchronizacja typu Numista', basic?.id, error);
            }
          }

          if (types.length < pageSize) {
            break;
          }

          page++;
        }
      }

      /*
       * Po synchronizacji odświeżamy dashboard i panel filtrów.
       */
      await this.refreshDashboards();
      this.refreshFilterViews();

      if (report.length) {
        console.info('2 Euro Collection: Numista types skipped or failed');
        console.table(report);
      }

      progress.setMessage(
        this.t('notice.syncDone', {
          created,
          updated,
          unchanged,
          existing,
          skipped,
          errors,
          scope: filteredSync ? scopeLabels.join(' / ') : this.t('notice.syncScopeAll'),
        })
      );

      setTimeout(() => progress.hide(), 8000);

      return {
        created,
        updated,
        unchanged,
        existing,
        skipped,
        errors,
        scope: syncScope,
      };
    } catch (error) {
      progress.setMessage(this.t('notice.syncAborted', { message: error?.message || error }));

      if (report.length) {
        console.info('2 Euro Collection: Numista types skipped or failed before abort');
        console.table(report);
      }

      await this.refreshDashboards();
      this.refreshFilterViews();

      console.error(error);
    }
  },

  async backfillCovers() {
    if (!tx(this.settings.numistaApiKey)) {
      new Notice(this.t('notice.apiKeyMissing'));
      return;
    }
    const candidates = this.getRows().filter(
        (r) => r.source === 'numista' && !r.cover_locked && !this.coverSrc(r)
      ),
      progress = new Notice(
        this.t('notice.coversProgress', {
          current: 0,
          total: candidates.length,
          downloaded: 0,
          errors: 0,
        }),
        0
      ),
      cache = new Map();
    let downloaded = 0,
      skipped = 0,
      errors = 0,
      index = 0;
    for (const r of candidates) {
      index++;
      progress.setMessage(
        this.t('notice.coversProgress', {
          current: index,
          total: candidates.length,
          downloaded,
          errors,
        })
      );
      try {
        let d = cache.get(r.numista_id);
        if (!d) {
          d = await this.api(`/types/${encodeURIComponent(r.numista_id)}?lang=en`);
          cache.set(r.numista_id, d);
        }
        const url = this.pickImage(d) || r.cover_url;
        if (!url) {
          skipped++;
          continue;
        }
        const path = await this.downloadCover(url, r.numista_id, r.numista_issue_id);
        await this.upsert({ ...r, cover_path: path, cover_url: url, cover_locked: false }, r.file);
        downloaded++;
      } catch (error) {
        errors++;
        console.error('Pobieranie okładki', r.file?.path, error);
      }
    }
    progress.setMessage(this.t('notice.coversDone', { downloaded, skipped, errors }));
    setTimeout(() => progress.hide(), 8000);
    return { downloaded, skipped, errors };
  },

  async downloadNumistaCoverForCoin(row) {
    if (!row.numista_id) throw new Error(this.t('error.noNumistaId'));
    const details = await this.api(`/types/${encodeURIComponent(row.numista_id)}?lang=en`),
      url = this.pickImage(details);
    if (!url) throw new Error(this.t('error.noNumistaCover'));
    const path = await this.downloadCover(url, row.numista_id, row.numista_issue_id || row.year);
    await this.app.fileManager.processFrontMatter(row.file, (fm) => {
      fm.cover = `[[${path}]]`;
      fm.cover_url = url;
      fm.cover_locked = false;
      fm.own_cover = false;
    });
  },

  async updateSingleCoinFromNumista(row) {
    if (!row.numista_id) throw new Error(this.t('error.noNumistaId'));
    const details = await this.api(`/types/${encodeURIComponent(row.numista_id)}?lang=en`),
      issuesRaw = await this.api(`/types/${encodeURIComponent(row.numista_id)}/issues?lang=en`),
      issues = Array.isArray(issuesRaw) ? issuesRaw : issuesRaw.issues || [],
      issue =
        issues.find((i) => String(i.id) === String(row.numista_issue_id)) ||
        issues.find(
          (i) =>
            String(i.gregorian_year || i.year) === String(row.year) &&
            tx(i.mint_letter) === tx(row.mint_mark)
        );
    if (!issue) throw new Error(this.t('error.noNumistaIssue'));
    const photo = this.photoMetadata(details),
      valuation = await this.issueNumismaticValues(row.numista_id, issue.id);
    await this.upsert(
      {
        ...row,
        country: countryName(details.issuer?.name),
        title: normalizeCoinTitle(details.title),
        mintage: issue.mintage ?? row.mintage,
        numista_url: tx(details.url),
        ...photo,
        numismatic_value_currency: valuation ? valuation.currency : row.numismatic_value_currency,
        numismatic_values: valuation ? valuation.values : row.numismatic_values,
        numismatic_value_unc: valuation ? valuation.unc : row.numismatic_value_unc,
      },
      row.file
    );
  },
};
