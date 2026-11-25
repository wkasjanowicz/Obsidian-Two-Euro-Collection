/*
 * Lint with the official Obsidian plugin rules (the same checks the community
 * plugin review runs). Run from the project root: npm run lint
 */
import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  globalIgnores([
    'node_modules',
    'main.js',
    'esbuild.config.mjs',
    'eslint.config.mjs',
    'eslint.config.strict.mjs',
    'scripts',
    'test',
    'StarterData',
  ]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.*'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
