import { Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { tx, clean } from '../utils.js';

export const vaultMethods = {
  /*
   * Applies new folder settings. Existing coins, covers and the dashboard are
   * moved to the new locations (after confirmation), and cover links in coin
   * notes are updated, so the collection is not "lost" after a rename.
   */
  async changeFolders(next) {
    const keys = ['rootFolder', 'collectionFolder', 'coinsFolder', 'coversFolder', 'dashboardFile'];
    const before = { coins: this.coins(), covers: this.covers(), dashboard: this.dashboard() };
    const previous = Object.fromEntries(keys.map((key) => [key, this.settings[key]]));
    for (const key of keys) if (key in next) this.settings[key] = tx(next[key]);
    const after = { coins: this.coins(), covers: this.covers(), dashboard: this.dashboard() };
    const moves = [];
    for (const key of ['coins', 'covers', 'dashboard']) {
      if (before[key] === after[key]) continue;
      if (!this.app.vault.getAbstractFileByPath(before[key])) continue;
      if (this.app.vault.getAbstractFileByPath(after[key])) {
        new Notice(this.t('notice.folderExists', { path: after[key] }));
        Object.assign(this.settings, previous);
        return false;
      }
      moves.push([before[key], after[key]]);
    }
    if (moves.length) {
      const list = moves.map(([from, to]) => `${from} → ${to}`).join('\n');
      if (!(await this.confirm(`${this.t('confirm.moveFolders')}\n${list}`))) {
        Object.assign(this.settings, previous);
        return false;
      }
      for (const [from, to] of moves) {
        const parent = to.includes('/') ? to.slice(0, to.lastIndexOf('/')) : '';
        if (parent) await this.ensureFolder(parent);
        await this.app.fileManager.renameFile(this.app.vault.getAbstractFileByPath(from), to);
      }
      if (before.covers !== after.covers) {
        for (const file of this.filesInFolder(after.coins, 'md')) {
          await this.app.vault.process(file, (content) =>
            content.split(`[[${before.covers}/`).join(`[[${after.covers}/`)
          );
        }
      }
    }
    await this.saveSettings();
    this.invalidateRows();
    await this.refreshDashboards();
    new Notice(this.t('notice.foldersChanged', { count: moves.length }));
    return true;
  },
  join(...a) {
    return normalizePath(
      a
        .map(tx)
        .map((x) => x.replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/')
    );
  },

  root() {
    return this.join(this.settings.rootFolder, this.settings.collectionFolder);
  },

  coins() {
    return this.join(this.root(), this.settings.coinsFolder);
  },

  covers() {
    return this.join(this.root(), this.settings.coversFolder);
  },

  dashboard() {
    const name = clean(this.settings.dashboardFile).replace(/\.md$/i, '') || '🪙 Kolekcja 2 Euro';
    return this.join(this.root(), `${name}.md`);
  },

  isSupportedImage(path) {
    const ext = (path || '').split('.').pop().toLowerCase();
    return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
  },

  async ensureFolder(path) {
    if (!path || (await this.app.vault.adapter.exists(path))) return;
    let c = '';
    for (const x of path.split('/')) {
      c = c ? `${c}/${x}` : x;
      if (!(await this.app.vault.adapter.exists(c))) await this.app.vault.createFolder(c);
    }
  },

  async ensureStructure() {
    await this.ensureFolder(this.root());
    await this.ensureFolder(this.coins());
    await this.ensureFolder(this.covers());
  },

  async ensureDashboard() {
    await this.ensureStructure();
    const p = this.dashboard();
    if (!(await this.app.vault.adapter.exists(p)))
      await this.app.vault.create(p, '```two-euro-collection\n```\n');
    return p;
  },

  async openDashboard() {
    const p = await this.ensureDashboard(),
      f = this.app.vault.getAbstractFileByPath(p);
    if (f instanceof TFile) await this.app.workspace.getLeaf(true).openFile(f);
    await this.activateFiltersView();
  },

  async uniquePath(p) {
    if (!(await this.app.vault.adapter.exists(p))) return p;
    const i = p.lastIndexOf('.');
    let n = 2;
    while (await this.app.vault.adapter.exists(`${p.slice(0, i)} ${n}${p.slice(i)}`)) n++;
    return `${p.slice(0, i)} ${n}${p.slice(i)}`;
  },

  /*
   * Lists files only inside the given collection folder (recursively), so the
   * plugin never enumerates the rest of the vault.
   */
  filesInFolder(path, extension = '') {
    const folder = path ? this.app.vault.getAbstractFileByPath(normalizePath(path)) : null;
    if (!(folder instanceof TFolder)) return [];
    const result = [],
      stack = [folder];
    while (stack.length) {
      for (const child of stack.pop().children || []) {
        if (child instanceof TFolder) stack.push(child);
        else if (child instanceof TFile && (!extension || child.extension === extension))
          result.push(child);
      }
    }
    return result;
  },

  async moveFolderContents(source, target) {
    if (source === target) return 0;
    const src = this.app.vault.getAbstractFileByPath(source);
    if (!src) return 0;
    await this.ensureFolder(target);
    let moved = 0;
    const files = this.filesInFolder(source);
    for (const f of files) {
      const rel = f.path.slice(source.length + 1),
        dest = this.join(target, rel);
      const parent = dest.includes('/') ? dest.slice(0, dest.lastIndexOf('/')) : '';
      if (parent) await this.ensureFolder(parent);
      if (await this.app.vault.adapter.exists(dest)) {
        continue;
      }
      await this.app.fileManager.renameFile(f, dest);
      moved++;
    }
    const left = this.app.vault.getAbstractFileByPath(source);
    if (left && left.children && left.children.length === 0)
      await this.app.vault.delete(left, true);
    return moved;
  },

  isCollectionPath(path) {
    const value = tx(path);
    if (!value) return false;
    return [this.coins(), this.covers()].some((folder) => value.startsWith(`${folder}/`));
  },
};
