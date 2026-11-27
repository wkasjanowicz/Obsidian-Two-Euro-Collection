import { Modal } from 'obsidian';

/*
 * Shows why Numista types were skipped during the last synchronization
 * (other country, not an official 2 euro coin, matched an existing coin…).
 */
export class SyncReportModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {import('../types').TwoEuroPlugin} plugin
   */
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const p = this.plugin,
      t = (/** @type {string} */ k, /** @type {Record<string, unknown>} */ v = {}) => p.t(k, v),
      c = this.contentEl,
      report = p.lastSyncReport;
    c.empty();
    c.addClass('twoeuro-sync-report');
    c.createEl('h2', { text: t('report.title') });
    if (!report) {
      c.createEl('p', { text: t('report.none') });
      return;
    }
    c.createEl('p', {
      text: t('report.summary', {
        date: report.date,
        scope: report.scope,
        count: report.items.length,
      }),
    });
    if (!report.items.length) {
      c.createEl('p', { text: t('report.empty') });
      return;
    }
    const list = c.createEl('ul');
    for (const item of report.items) {
      const li = list.createEl('li');
      if (item.id)
        li.createEl('a', {
          text: `N#${item.id}`,
          attr: { href: `https://en.numista.com/${item.id}` },
        });
      li.appendText(` ${item.title || ''} — ${item.reason}`);
    }
  }
  onClose() {
    this.contentEl.empty();
  }
}
