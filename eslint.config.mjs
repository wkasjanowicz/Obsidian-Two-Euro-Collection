/*
 * Lint with the official Obsidian plugin rules plus the type-checked rules the
 * community plugin scanner also runs on JavaScript (types come from JSDoc and
 * src/types.d.ts). Run from the project root: npm run lint
 */
import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'node_modules',
    'main.js',
    'esbuild.config.mjs',
    'eslint.config.mjs',
    'scripts',
    'test',
    'StarterData',
  ]),
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.js'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    rules: {
      'obsidianmd/no-unsupported-api': 'error',
      'obsidianmd/no-await-chainable': 'error',
      'obsidianmd/no-plugin-as-component': 'error',
      'obsidianmd/no-view-references-in-plugin': 'error',
      'obsidianmd/no-misused-promises': 'error',
      'obsidianmd/prefer-create-el': 'warn',
      'obsidianmd/prefer-file-manager-trash-file': 'warn',
      'obsidianmd/prefer-instanceof': 'warn',
      'obsidianmd/prefer-get-language': 'warn',
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.*'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
