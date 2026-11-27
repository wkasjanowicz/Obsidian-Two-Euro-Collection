import { Notice, TFile } from 'obsidian';
import {
  tx,
  isTrue,
  normalizeCoinTitle,
  coinIdentityKey,
  countryName,
  asError,
  errorText,
} from '../utils.js';

/** @typedef {import('../types').CoinRow} CoinRow */
/** @typedef {import('../types').CoinData} CoinData */
/** @typedef {import('../types').NumistaType} NumistaType */
/** @typedef {import('../types').NumistaIssue} NumistaIssue */
/** @typedef {import('../types').SyncReportItem} SyncReportItem */
/** @typedef {import('../types').SyncScope} SyncScope */
/** @typedef {import('../types').SyncRun} SyncRun */
/** @typedef {import('../types').SyncCounts} SyncCounts */

/*
 * Synchronization of coin notes with the Numista catalogue (whole collection
 * or the current country / year / type filter) and the update of one coin.
 */
const SYNC_PAGE_SIZE = 50;
const SYNC_MAX_PAGES = 200;

/**
 * Key of a coin from one Numista issue: type id, year and mint.
 * @param {unknown} id
 * @param {unknown} year
 * @param {unknown} mint
 */
const syncRowKey = (id, year, mint) => [tx(id), tx(year), tx(mint)].join(':');

/**
 * Fields compared to decide whether a synchronized coin changed.
 * @param {CoinData} row
 */
const syncFingerprint = (row) =>
  JSON.stringify([
    row.country,
    row.title,
    row.coin_type,
    row.numista_url,
    row.mintage,
    row.cover_url,
    row.reference_year,
    row.cover_locked,
    row.photo_author,
    row.photo_license,
    row.numismatic_value_currency,
    row.numismatic_values,
    row.numismatic_value_unc,
  ]);

/** @satisfies {ThisType<import('../types').TwoEuroPlugin>} */
export const syncMethods = {
  getNumistaSyncScope() {
    const state = this.getDashboardState();
    return {
      country: tx(state.country),
      year: tx(state.year),
      coinType: ['national', 'commemorative'].includes(state.mode) ? state.mode : '',
    };
  },

  /**
   * @param {SyncScope | null} [scope]
   */
  syncNumista(scope = null) {
    return this.runOperation(() => this.syncNumistaRun(scope));
  },
  /*
   * Synchronization with the Numista catalogue, split into steps:
   * createSyncRun (state of one run) -> fetchNumistaTypesPage (one page of
   * search results) -> syncNumistaType (one catalogue type) -> syncNumistaIssue
   * (one year / mint of that type, saved as a coin note) -> finishSyncRun.
   */
  /**
   * @param {SyncScope | null} [scope]
   * @returns {Promise<(SyncCounts & { scope: SyncScope }) | undefined>}
   */
  async syncNumistaRun(scope = null) {
    if (!this.getNumistaApiKey()) {
      new Notice(this.t('notice.apiKeyMissing'));
      return;
    }
    const run = this.createSyncRun(scope);
    const objectTypes =
      run.scope.coinType === 'national'
        ? ['1']
        : run.scope.coinType === 'commemorative'
          ? ['2', '3']
          : ['1', '2', '3'];
    try {
      const issuerCode = run.scope.country
        ? await this.getNumistaIssuerCode(run.scope.country)
        : '';
      for (const objectType of objectTypes) {
        const typeLabel =
          objectType === '1' ? this.t('filter.national') : this.t('filter.commemorative');
        for (let page = 1; ; page++) {
          if (page > SYNC_MAX_PAGES) {
            throw new Error(
              `Numista pagination safety limit exceeded for object type ${objectType}.`
            );
          }
          const types = await this.fetchNumistaTypesPage(run, objectType, page, issuerCode);
          for (const basic of types) {
            run.processed++;
            run.progress.setMessage(
              run.filtered
                ? this.t('notice.syncProgress', {
                    scope: run.label,
                    type: typeLabel,
                    count: run.processed,
                  })
                : this.t('notice.syncProgressAll', { type: typeLabel, count: run.processed })
            );
            try {
              await this.syncNumistaType(run, basic);
            } catch (error) {
              if (this.isNumistaAuthError(error) || asError(error).aborted) throw error;
              run.counts.errors++;
              run.report.push({
                id: tx(basic?.id),
                title: tx(basic?.title),
                reason: `error: ${errorText(error)}`,
              });
              console.error('Numista type synchronization', basic?.id, error);
            }
          }
          if (types.length < SYNC_PAGE_SIZE) break;
        }
      }
      await this.finishSyncRun(run);
      run.progress.setMessage(this.t('notice.syncDone', { ...run.counts, scope: run.label }));
      window.setTimeout(() => run.progress.hide(), 8000);
      return { ...run.counts, scope: run.scope };
    } catch (error) {
      run.progress.setMessage(this.t('notice.syncAborted', { message: errorText(error) }));
      window.setTimeout(() => run.progress.hide(), 10000);
      await this.finishSyncRun(run);
      console.error(error);
    }
  },

  /**
   * State of one synchronization: its scope, progress notice, counters,
   * report and indexes of the coins already in the collection.
   * @param {SyncScope | null} [scope]
   * @returns {SyncRun}
   */
  createSyncRun(scope = null) {
    const syncScope = {
      country: tx(scope?.country),
      year: tx(scope?.year),
      coinType: tx(scope?.coinType),
    };
    /** @type {string[]} */
    const labels = [];
    if (syncScope.country) labels.push(syncScope.country);
    if (syncScope.year) labels.push(syncScope.year);
    if (syncScope.coinType) {
      labels.push(
        syncScope.coinType === 'commemorative'
          ? this.t('filter.commemorative')
          : this.t('filter.national')
      );
    }
    const filtered = labels.length > 0;
    const label = filtered ? labels.join(' / ') : this.t('notice.syncScopeAll');
    const current = this.getRows();

    /*
     * numista_id -> years already in the collection. Used to skip types the
     * collection already has without spending Numista API requests.
     */
    /** @type {Map<string, Set<string>>} */
    const localYears = new Map();
    for (const row of current) {
      if (!row.numista_id) continue;
      const years = localYears.get(row.numista_id) || new Set();
      years.add(row.year);
      localYears.set(row.numista_id, years);
    }

    return {
      scope: syncScope,
      filtered,
      label,
      progress: this.progressNotice(
        filtered ? this.t('notice.syncScope', { scope: label }) : this.t('notice.syncOfficial')
      ),
      byKey: new Map(
        current.map((row) => [syncRowKey(row.numista_id, row.year, row.mint_mark), row])
      ),
      /*
       * Coins identified by country, year, title and mint. Catches coins added
       * manually (no numista_id) or under another Numista id, so synchronization
       * does not create duplicates of them.
       */
      byIdentity: new Map(current.map((row) => [coinIdentityKey(row), row])),
      localYears,
      updateExisting: isTrue(this.settings.syncUpdateExisting),
      useServerFilters: true,
      processed: 0,
      counts: { created: 0, updated: 0, unchanged: 0, existing: 0, skipped: 0, errors: 0 },
      report: [],
    };
  },

  /**
   * One page of Numista search results for 2 euro coins of an object type.
   * Year and issuer are filtered on the server when Numista accepts it;
   * if it rejects those filters, the search is repeated without them (the
   * country, year and type are still checked locally).
   * @param {SyncRun} run
   * @param {string} objectType
   * @param {number} page
   * @param {string} issuerCode
   * @returns {Promise<NumistaType[]>}
   */
  async fetchNumistaTypesPage(run, objectType, page, issuerCode) {
    const q = new URLSearchParams({
      q: '2 Euros',
      object_type: objectType,
      page: String(page),
      count: String(SYNC_PAGE_SIZE),
      lang: 'en',
    });
    if (run.useServerFilters && run.scope.year) q.set('year', run.scope.year);
    if (run.useServerFilters && issuerCode) q.set('issuer', issuerCode);
    /** @type {import('../types').NumistaTypesPage} */
    let listing;
    try {
      listing = /** @type {import('../types').NumistaTypesPage} */ (await this.api(`/types?${q}`));
    } catch (error) {
      if (
        this.isNumistaAuthError(error) ||
        page !== 1 ||
        !run.useServerFilters ||
        !(q.has('year') || q.has('issuer'))
      ) {
        throw error;
      }
      console.warn('Numista rejected server-side filters, retrying without them', error);
      run.useServerFilters = false;
      q.delete('year');
      q.delete('issuer');
      listing = /** @type {import('../types').NumistaTypesPage} */ (await this.api(`/types?${q}`));
    }
    return listing.types || [];
  },

  /**
   * Synchronizes one Numista type: checks that it is an official 2 euro coin
   * in the requested country and type, then saves each matching issue.
   * @param {SyncRun} run
   * @param {NumistaType} basic search result
   */
  async syncNumistaType(run, basic) {
    const id = tx(basic.id);
    /** @param {string} reason */
    const skip = (reason) => {
      run.counts.skipped++;
      run.report.push({ id, title: tx(basic.title), reason });
    };
    if (!id) return skip('no id');
    if (!run.updateExisting && this.isTypeAlreadyInCollection(basic, run.scope, run.localYears)) {
      run.counts.existing++;
      return;
    }

    const details = await this.getTypeDetails(id);
    if (!details || !this.isOfficialTwoEuroType(details)) {
      return skip(
        `not official 2 euro (issuer: ${tx(details?.issuer?.name)}, type: ${tx(details?.object_type?.name)}, value: ${tx(details?.value?.text)})`
      );
    }
    if (
      run.scope.country &&
      !this.matchesNumistaSyncCountry(details.issuer?.name, run.scope.country)
    ) {
      return skip(`other country (${tx(details.issuer?.name)})`);
    }
    // The type filter is applied before the issue list is requested.
    const coinType = this.numistaCoinType(details);
    if (run.scope.coinType && coinType !== run.scope.coinType) {
      return skip(`other type (${coinType})`);
    }

    // Issues are requested only after the country and type checks.
    const issues = await this.getTypeIssues(id);
    const selected = this.selectSyncIssues(issues, run.scope.year);
    if (!selected.length) {
      return skip(
        `no matching issues (Numista issues: ${issues.length}, years: ${
          issues.map((item) => tx(item.gregorian_year || item.year)).join(', ') || '-'
        })`
      );
    }
    for (const issue of selected) await this.syncNumistaIssue(run, details, coinType, issue);
  },

  /**
   * Local coin type of a Numista type: commemorative or national (circulation).
   * @param {NumistaType} details
   * @returns {'commemorative' | 'national'}
   */
  numistaCoinType(details) {
    const kind = tx(details.object_type?.name).toLowerCase();
    const objectTypeId = Number(details.object_type?.id);
    return objectTypeId === 2 ||
      objectTypeId === 3 ||
      kind.includes('commemorative') ||
      kind.includes('non-circulating') ||
      Boolean(tx(details.commemorated_topic))
      ? 'commemorative'
      : 'national';
  },

  /**
   * Issues to save, one per year and mint, limited to the requested year.
   * When Numista lists the same year and mint more than once, the record
   * with the largest mintage is kept.
   * @param {NumistaIssue[]} issues
   * @param {string} year requested year, '' for all
   * @returns {NumistaIssue[]}
   */
  selectSyncIssues(issues, year) {
    /** @type {Map<string, NumistaIssue>} */
    const unique = new Map();
    for (const issue of issues) {
      const issueYear = tx(issue.gregorian_year || issue.year);
      if (!Number(issueYear)) continue;
      if (year && issueYear !== year) continue;
      const key = `${issueYear}|${tx(issue.mint_letter)}`;
      const previous = unique.get(key);
      if (!previous || Number(issue.mintage || 0) > Number(previous.mintage || 0)) {
        unique.set(key, issue);
      }
    }
    return [...unique.values()];
  },

  /**
   * Saves one issue (year and mint) of a Numista type as a coin note:
   * creates it, updates it (when enabled), or links an existing coin that
   * has no Numista id yet instead of creating a duplicate.
   * @param {SyncRun} run
   * @param {NumistaType} details
   * @param {string} coinType
   * @param {NumistaIssue} issueRow
   */
  async syncNumistaIssue(run, details, coinType, issueRow) {
    const id = tx(details.id);
    const issue = tx(issueRow.id);
    const year = tx(issueRow.gregorian_year || issueRow.year);
    const mint = tx(issueRow.mint_letter);
    const rowKey = syncRowKey(id, year, mint);
    const old = run.byKey.get(rowKey);

    if (old && !run.updateExisting) {
      run.counts.existing++;
      return;
    }

    if (!old) {
      const twin = run.byIdentity.get(
        coinIdentityKey({
          country: details.issuer?.name,
          year,
          title: details.title,
          mint_mark: mint,
        })
      );
      if (twin) {
        // The coin already exists without this Numista id. Link it when it
        // has no id yet; never create a duplicate.
        if (!twin.numista_id && twin.file instanceof TFile) {
          await this.app.fileManager.processFrontMatter(
            twin.file,
            (/** @type {Record<string, unknown>} */ fm) => {
              fm.numista_id = id;
              fm.numista_issue_id = issue;
              if (tx(details.url)) fm.numista_url = tx(details.url);
            }
          );
          twin.numista_id = id;
          twin.numista_issue_id = issue;
        }
        run.report.push({
          id,
          title: tx(details.title),
          reason: `matched existing coin ${twin.file?.path || ''}`,
        });
        run.byKey.set(rowKey, twin);
        run.counts.existing++;
        return;
      }
    }

    const sourceImage = this.pickImage(details);
    /** @type {CoinData} */
    const data = {
      ...(old || {}),
      country: countryName(details.issuer?.name),
      year,
      title: normalizeCoinTitle(details.title),
      coin_type: coinType,
      mint_mark: mint,
      source: 'numista',
      numista_id: id,
      numista_issue_id: issue,
      numista_url: tx(details.url),
      mintage: issueRow.mintage ?? null,
      official_issue: true,
      object_type_id: tx(details.object_type?.id),
      object_type_name: tx(details.object_type?.name),
      ...this.photoMetadata(details),
      // Prices are not downloaded during synchronization (use "Update
      // prices"), so existing values are kept.
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
      if (syncFingerprint(old) === syncFingerprint(data)) {
        run.counts.unchanged++;
        return;
      }
      await this.upsert(data, old.file);
      run.counts.updated++;
    } else {
      await this.upsert(data, null);
      run.counts.created++;
    }
    run.byKey.set(rowKey, { ...data, file: old?.file });
  },

  /**
   * Refreshes the views and keeps the report of skipped types.
   * @param {SyncRun} run
   */
  async finishSyncRun(run) {
    await this.refreshDashboards();
    this.refreshFilterViews();
    this.storeSyncReport(run.report, run.label);
  },

  /**
   * @param {NumistaType} basic
   * @param {SyncScope} scope
   * @param {Map<string, Set<string>>} localYears
   */
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

  /* Keeps the list of skipped Numista types for the "last synchronization report" command. */
  /**
   * @param {SyncReportItem[]} items
   * @param {string} scope
   */
  storeSyncReport(items, scope) {
    this.lastSyncReport = { date: new Date().toLocaleString(), scope, items: [...items] };
    if (items.length) console.debug('2 Euro Collection: skipped Numista types', items);
  },

  /**
   * @param {CoinRow} row
   */
  async updateSingleCoinFromNumista(row) {
    if (!row.numista_id) throw new Error(this.t('error.noNumistaId'));
    const details = await this.getTypeDetails(row.numista_id, { fresh: true }),
      issues = await this.getTypeIssues(row.numista_id, { fresh: true }),
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
