import { Notice, TFile } from 'obsidian';

export const selectionMethods = {
  getSelectedCoinFiles() {
    const selected = this.selectedCoinPaths || new Set();
    return this.getRows().filter((row) => selected.has(row.file.path));
  },

  toggleCoinSelection(path, selected) {
    if (!this.selectedCoinPaths) this.selectedCoinPaths = new Set();
    if (selected) this.selectedCoinPaths.add(path);
    else this.selectedCoinPaths.delete(path);
    this.refreshFilterViews();
  },

  clearCoinSelection() {
    if (!this.selectedCoinPaths) this.selectedCoinPaths = new Set();
    else this.selectedCoinPaths.clear();
  },

  async duplicateSelectedCoins() {
    const rows = this.getSelectedCoinFiles();
    if (!rows.length) {
      new Notice(this.t('notice.noSelection'));
      return;
    }
    let count = 0;
    const newSelection = new Set();
    for (const row of rows) {
      try {
        const source = await this.app.vault.read(row.file),
          target = await this.uniquePath(row.file.path),
          duplicate = await this.app.vault.create(target, source);
        await this.app.fileManager.processFrontMatter(duplicate, (fm) => {
          fm.coin_id = `duplicate-${Date.now()}-${count + 1}`;
          fm.source = 'manual';
          delete fm.numista_id;
          delete fm.numista_issue_id;
          delete fm.numista_url;
        });
        newSelection.add(duplicate.path);
        count++;
      } catch (error) {
        console.error('Duplicate coin', row.file?.path, error);
      }
    }
    this.selectedCoinPaths = newSelection;
    await this.refreshDashboards();
    this.refreshFilterViews();
    new Notice(this.t('notice.batchDuplicate', { count }));
  },

  async deleteSelectedCoins() {
    const rows = this.getSelectedCoinFiles();
    if (!rows.length) {
      new Notice(this.t('notice.noSelection'));
      return;
    }
    if (
      !(await this.confirm(this.t('confirm.deleteSelected', { count: rows.length }), {
        warning: true,
      }))
    )
      return;
    let count = 0;
    const deletedPaths = new Set(),
      coverPaths = new Set();
    for (const row of rows) {
      try {
        const coverPath = this.localPath(row);
        await this.app.fileManager.trashFile(row.file);
        deletedPaths.add(row.file.path);
        if (coverPath) coverPaths.add(coverPath);
        count++;
      } catch (error) {
        console.error('Delete coin', row.file?.path, error);
      }
    }
    // Trash covers that are no longer used by any remaining coin.
    const usedCovers = new Set(
      this.getRows()
        .filter((row) => !deletedPaths.has(row.file.path))
        .map((row) => this.localPath(row))
        .filter(Boolean)
    );
    for (const coverPath of coverPaths) {
      if (usedCovers.has(coverPath)) continue;
      const coverFile = this.app.vault.getAbstractFileByPath(coverPath);
      if (!(coverFile instanceof TFile)) continue;
      try {
        await this.app.fileManager.trashFile(coverFile);
      } catch (error) {
        console.error('Delete cover', coverPath, error);
      }
    }
    this.clearCoinSelection();
    await this.refreshDashboards();
    this.refreshFilterViews();
    new Notice(this.t('notice.batchDelete', { count }));
  },
};
