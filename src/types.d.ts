/*
 * Types for editor and lint checks only (JSDoc). Nothing here is bundled.
 */
import type { Plugin, TFile } from 'obsidian';
import type { settingsMethods } from './plugin/settings.js';
import type { i18nMethods } from './plugin/i18n.js';
import type { vaultMethods } from './plugin/vault.js';
import type { coinsMethods } from './plugin/coins.js';
import type { maintenanceMethods } from './plugin/maintenance.js';
import type { numistaMethods } from './plugin/numista.js';
import type { syncMethods } from './plugin/sync.js';
import type { pricesMethods } from './plugin/prices.js';
import type { coversMethods } from './plugin/covers.js';
import type { newIssuesMethods } from './plugin/newissues.js';
import type { basesMethods } from './plugin/bases.js';
import type { starterMethods } from './plugin/starter.js';
import type { selectionMethods } from './plugin/selection.js';
import type { imagesMethods } from './plugin/images.js';
import type { dashboardMethods } from './plugin/dashboard.js';
import type { historyMethods } from './plugin/history.js';
import type { exportMethods } from './plugin/export.js';
import type { operationsMethods } from './plugin/operations.js';
import type { cacheMethods } from './plugin/cache.js';
import type { diagnosticsMethods } from './plugin/diagnostics.js';
import type { lifecycleMethods } from './plugin/lifecycle.js';
import type { EuroSettings } from './ui/EuroSettings.js';

type Mixins = typeof lifecycleMethods &
  typeof settingsMethods &
  typeof i18nMethods &
  typeof vaultMethods &
  typeof coinsMethods &
  typeof maintenanceMethods &
  typeof numistaMethods &
  typeof syncMethods &
  typeof pricesMethods &
  typeof coversMethods &
  typeof newIssuesMethods &
  typeof basesMethods &
  typeof starterMethods &
  typeof selectionMethods &
  typeof imagesMethods &
  typeof dashboardMethods &
  typeof historyMethods &
  typeof exportMethods &
  typeof operationsMethods &
  typeof cacheMethods &
  typeof diagnosticsMethods;

export interface DashboardState {
  mode: string;
  country: string;
  year: string;
  searchText: string;
  sortMode: string;
  groupBy: string;
  statsOpen: boolean;
}

export interface Amount {
  currency: string;
  amount: number;
}

export interface ValueSnapshot {
  date: string;
  owned: number;
  total: number;
  value: Amount[];
  spent: Amount[];
}

export interface Settings {
  rootFolder: string;
  collectionFolder: string;
  coinsFolder: string;
  coversFolder: string;
  numistaApiKey: string;
  numistaSecretId: string;
  columns: number;
  language: string;
  referenceDataInitialized: boolean;
  referenceIssuers: string[];
  additionalIssuers: string[];
  additionalYears: string[];
  referenceYearFrom: number;
  futureYears: number;
  syncUpdateExisting: boolean;
  dashboardFile: string;
  defaultCurrency: string;
  dashboardState: Partial<DashboardState> | null;
  numistaRequestMonth: string;
  numistaRequestCount: number;
  numistaCacheDays: number;
  valueHistory: ValueSnapshot[];
  newIssuesCheckDays: number;
  newIssuesLastCheck: string;
  [key: string]: unknown;
}

export interface NumistaValue {
  issue_id?: string | number;
  grade?: string;
  price?: number;
  currency?: string;
  [key: string]: unknown;
}

/* One coin note as read from the vault (see coinsMethods.readRows). */
export type CoinRow = {
  file: TFile;
  country: string;
  year: string;
  title: string;
  coin_type: string;
  mint_mark: string;
  owned: boolean;
  quantity: number;
  acquisition_date: string;
  acquisition_price: unknown;
  acquisition_currency: string;
  condition: string;
  notes: string;
  source: string;
  numista_id: string;
  numista_issue_id: string;
  numista_url: string;
  mintage: unknown;
  cover: string;
  cover_url: string;
  reference_year: string;
  cover_locked: boolean;
  own_cover: boolean;
  official_issue: boolean;
  object_type_id: string;
  object_type_name: string;
  photo_author: string;
  photo_author_url: string;
  photo_license: string;
  photo_license_url: string;
  numismatic_value_currency: string;
  numismatic_values: NumistaValue[];
  numismatic_value_unc: unknown;
};

/* A coin in the starter pack (StarterData/starter-pack.json). */
export type StarterCoin = Omit<Partial<CoinRow>, 'cover'> & {
  cover?: { fileName?: string; base64?: string };
};

export interface StarterPack {
  schemaVersion?: number;
  coins?: StarterCoin[];
}

/* Coin data to save: a row being edited or built from Numista. */
export type CoinData = Partial<CoinRow> & Record<string, unknown>;

export interface SyncReportItem {
  id: string;
  title: string;
  reason: string;
}

export interface Operation {
  aborted: boolean;
  requests: number;
  notices: import('obsidian').Notice[];
}

/* An error as thrown by requestUrl, Numista calls or an aborted operation. */
export interface PluginError extends Error {
  status?: number;
  response?: { status?: number };
  numistaAuth?: boolean;
  aborted?: boolean;
}

export interface NumistaSide {
  picture?: string;
  thumbnail?: string;
  picture_copyright?: string;
  picture_copyright_url?: string;
  picture_license_name?: string;
  picture_license_url?: string;
}

/* A Numista type: a search result (/types) or its details (/types/{id}). */
export interface NumistaType {
  id: number | string;
  title?: string;
  url?: string;
  min_year?: number;
  max_year?: number;
  issuer?: { code?: string; name?: string };
  object_type?: { id?: number | string; name?: string };
  value?: {
    numeric_value?: number;
    text?: string;
    currency?: { name?: string; full_name?: string };
  };
  commemorated_topic?: string;
  obverse?: NumistaSide;
  pictures?: unknown;
  images?: unknown;
}

export interface NumistaIssue {
  id: number | string;
  year?: number | string;
  gregorian_year?: number | string;
  mint_letter?: string;
  mintage?: number;
  comment?: string;
}

export interface NumistaTypesPage {
  count?: number;
  types?: NumistaType[];
}

export interface NumistaPrices {
  currency?: string;
  prices?: { grade?: string; price?: number }[];
}

export interface NumistaIssuer {
  code?: string;
  name?: string;
}

export interface NumistaValuation {
  currency: string;
  values: { grade: string; price: number }[];
  unc: number | null;
}

/* Country, year and coin type limits of a synchronization. */
export interface SyncScope {
  country?: string;
  year?: string;
  coinType?: string;
}

export interface CoinSnapshot {
  notePath: string;
  noteContent: string;
  coverPath: string;
  backupImagePath: string;
  createdAt: string;
}

/* Coins found on Numista that the collection does not have (newissues.js). */
export interface NewIssuesResult {
  total: number;
  byYear: { year: string; count: number; titles: string[] }[];
}

export interface SyncCounts {
  created: number;
  updated: number;
  unchanged: number;
  existing: number;
  skipped: number;
  errors: number;
}

/* State of one synchronization run (see syncMethods). */
export interface SyncRun {
  scope: { country: string; year: string; coinType: string };
  filtered: boolean;
  label: string;
  progress: import('obsidian').Notice;
  byKey: Map<string, CoinData>;
  byIdentity: Map<string, CoinRow>;
  localYears: Map<string, Set<string>>;
  updateExisting: boolean;
  useServerFilters: boolean;
  processed: number;
  counts: SyncCounts;
  report: SyncReportItem[];
}

export interface CacheEntry<T> {
  t: number;
  v: T;
}

export interface NumistaCache {
  types: Record<string, CacheEntry<NumistaType | null>>;
  issues: Record<string, CacheEntry<NumistaIssue[]>>;
}

export interface TwoEuroPlugin extends Plugin, Mixins {
  settings: Settings;
  settingTab: EuroSettings;
  dashboardState: DashboardState;
  selectedCoinPaths: Set<string>;
  currentCoinFile: TFile | null;
  exportKind: string;
  imagePreset: string;
  lastSyncReport: { date: string; scope: string; items: SyncReportItem[] } | null;
  externalLanguages: Record<string, Record<string, string>>;
  availableLanguages: { code: string; name: string }[];
  _rowsCache: CoinRow[] | null;
  _numistaCache: NumistaCache | null;
  _numistaIssuers: NumistaIssuer[] | null;
  _operation: Operation | null;
  _dashboards: Set<HTMLElement> | undefined;
  _dashboardWasOpen: boolean;
  _lastRequestAt: number;
  _refreshTimer: number | null;
  _cacheSaveTimer: number | null;
  _settingsSaveTimer: number | null;
}
