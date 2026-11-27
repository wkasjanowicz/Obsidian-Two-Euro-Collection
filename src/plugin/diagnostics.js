import { Notice, Platform, apiVersion } from 'obsidian';

/** @satisfies {ThisType<import('../types').TwoEuroPlugin>} */
export const diagnosticsMethods = {
  /*
   * Text for bug reports: versions, platform, folders, collection counts and
   * settings. The Numista API key is never included.
   */
  diagnosticsReport() {
    const rows = this.getRows();
    const covers = this.filesInFolder(this.covers());
    /** @type {Record<string, number>} */
    const byExtension = {};
    for (const file of covers) byExtension[file.extension] = (byExtension[file.extension] || 0) + 1;
    const { numistaApiKey, valueHistory, dashboardState, referenceIssuers, ...settings } =
      this.settings;
    const lines = [
      '## 2 Euro Collection – diagnostics',
      `- Plugin: ${this.manifest.version}`,
      `- Obsidian API: ${apiVersion || '?'}`,
      `- Platform: ${Platform?.isMobile ? 'mobile' : 'desktop'}${Platform?.isIosApp ? ' (iOS)' : ''}${Platform?.isAndroidApp ? ' (Android)' : ''}${Platform?.isMacOS ? ' (macOS)' : ''}${Platform?.isWin ? ' (Windows)' : ''}${Platform?.isLinux ? ' (Linux)' : ''}`,
      `- Interface language: ${this.getLanguage()} (setting: ${this.settings.language})`,
      `- Collection folder: ${this.root()}`,
      `- Coins: ${rows.length} (owned ${rows.filter((r) => r.owned).length}, linked to Numista ${rows.filter((r) => r.numista_id).length})`,
      `- Covers: ${covers.length} ${JSON.stringify(byExtension)}`,
      `- Numista API key set: ${this.getNumistaApiKey() ? 'yes' : 'no'} (${this.settings.numistaSecretId ? 'secret storage' : numistaApiKey ? 'plugin settings' : 'none'})`,
      `- Numista requests this month: ${this.settings.numistaRequestCount || 0} (${this.settings.numistaRequestMonth || '-'})`,
      `- Numista cache entries: ${this.numistaCacheSize()}`,
      `- Value history entries: ${(valueHistory || []).length}`,
      `- Reference issuers: ${(referenceIssuers || []).length}`,
      '',
      '```json',
      JSON.stringify(settings, null, 2),
      '```',
    ];
    return lines.join('\n');
  },

  async copyDiagnostics() {
    await this.loadNumistaCache();
    const report = this.diagnosticsReport();
    try {
      await navigator.clipboard.writeText(report);
      new Notice(this.t('notice.diagnosticsCopied'));
    } catch {
      console.warn(report);
      new Notice(this.t('notice.diagnosticsConsole'));
    }
    return report;
  },
};
