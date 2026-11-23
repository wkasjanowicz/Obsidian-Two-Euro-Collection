export const VIEW_TYPE_FILTERS = 'two-euro-filters-view';

// Processed covers (background removal, catalog preset) are saved as WebP up to this size.
export const COVER_MAX_SIZE = 1200;

export const COVER_WEBP_QUALITY = 0.85;

export const DEFAULT_REFERENCE_ISSUERS = [
  'Andorra',
  'Austria',
  'Belgium',
  'Bulgaria',
  'Croatia',
  'Cyprus',
  'Estonia',
  'Finland',
  'France',
  'Germany',
  'Greece',
  'Ireland',
  'Italy',
  'Latvia',
  'Lithuania',
  'Luxembourg',
  'Malta',
  'Monaco',
  'Netherlands',
  'Portugal',
  'San Marino',
  'Slovakia',
  'Slovenia',
  'Spain',
  'Vatican',
];

export const DEFAULTS = {
  rootFolder: '/',
  collectionFolder: '2 Euro',
  coinsFolder: 'Coins',
  coversFolder: 'Covers',
  numistaApiKey: '',
  columns: 6,
  language: 'auto',

  referenceDataInitialized: false,
  referenceIssuers: [],
  additionalIssuers: [],
  additionalYears: [],
  referenceYearFrom: 1999,
  futureYears: 1,
  syncUpdateExisting: false,
};
