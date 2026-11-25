/*
 * Stricter lint matching the community plugin scanner, which also runs the
 * type-checked rules on JavaScript files. Run: npm run lint:strict
 */
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import base from './eslint.config.mjs';

export default defineConfig([
  ...base,
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
      // Untyped JavaScript: reported as warnings, as the scanner does.
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
    },
  },
]);
