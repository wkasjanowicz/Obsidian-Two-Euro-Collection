/*
 * Translations bundled into main.js at build time, so they work for users who
 * install only main.js, manifest.json and styles.css from a GitHub release.
 * Files in the plugin's Languages folder still override them at runtime.
 * To add a language: create Languages/<code>.json and import it below.
 */
import pl from '../../Languages/pl.json';
import de from '../../Languages/de.json';
import fr from '../../Languages/fr.json';

export const BUILTIN_LANGUAGES = Object.fromEntries(
  [pl, de, fr]
    .filter((lang) => lang && lang.code && lang.strings)
    .map((lang) => [
      String(lang.code).toLowerCase(),
      { name: lang.name || lang.code, strings: lang.strings },
    ])
);
