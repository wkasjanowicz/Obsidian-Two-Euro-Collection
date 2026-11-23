import { TFile } from 'obsidian';
import { tx, clean } from '../utils.js';

export const historyMethods = {
  historyFolder() {
    return this.join(this.root(), '.history');
  },

  historyKey(row) {
    return clean(row.file.path).replace(/\s+/g, '-');
  },

  async snapshotCoinState(row) {
    await this.ensureFolder(this.historyFolder());
    const noteContent = await this.app.vault.read(row.file),
      coverPath = this.localPath(row),
      snapshot = {
        notePath: row.file.path,
        noteContent,
        coverPath,
        backupImagePath: '',
        createdAt: new Date().toISOString(),
      };
    if (coverPath) {
      const coverFile = this.app.vault.getAbstractFileByPath(coverPath);
      if (coverFile instanceof TFile) {
        const ext = coverFile.extension || 'bin',
          backup = this.join(this.historyFolder(), `${this.historyKey(row)}.${ext}`);
        await this.app.vault.adapter.writeBinary(
          backup,
          new Uint8Array(await this.app.vault.readBinary(coverFile))
        );
        snapshot.backupImagePath = backup;
      }
    }
    await this.app.vault.adapter.write(
      this.join(this.historyFolder(), `${this.historyKey(row)}.json`),
      JSON.stringify(snapshot, null, 2)
    );
  },

  async undoCoinChange(row) {
    const metaPath = this.join(this.historyFolder(), `${this.historyKey(row)}.json`);
    if (!(await this.app.vault.adapter.exists(metaPath))) return false;
    const snapshot = JSON.parse(await this.app.vault.adapter.read(metaPath)),
      current = this.getRows().find((r) => r.file.path === row.file.path),
      currentCover = current ? this.localPath(current) : '';
    if (
      snapshot.backupImagePath &&
      snapshot.coverPath &&
      (await this.app.vault.adapter.exists(snapshot.backupImagePath))
    ) {
      await this.app.vault.adapter.writeBinary(
        snapshot.coverPath,
        new Uint8Array(await this.app.vault.adapter.readBinary(snapshot.backupImagePath))
      );
    }
    await this.app.vault.modify(row.file, snapshot.noteContent);
    if (
      currentCover &&
      currentCover !== snapshot.coverPath &&
      (await this.app.vault.adapter.exists(currentCover))
    )
      await this.app.vault.adapter.remove(currentCover);
    await this.app.vault.adapter.remove(metaPath);
    if (snapshot.backupImagePath && (await this.app.vault.adapter.exists(snapshot.backupImagePath)))
      await this.app.vault.adapter.remove(snapshot.backupImagePath);
    return true;
  },

  async loadCustomCoverFromDisk(row, file) {
    await this.ensureFolder(this.covers());
    const ext = (file.name.split('.').pop() || 'png').toLowerCase(),
      desired = await this.uniqueCoverPath(
        this.join(this.covers(), `${this.coverFileStem(row)}.${ext}`),
        this.localPath(row)
      );
    await this.app.vault.adapter.writeBinary(desired, new Uint8Array(await file.arrayBuffer()));
    await this.app.fileManager.processFrontMatter(row.file, (fm) => {
      fm.cover = `[[${desired}]]`;
      fm.reference_year = tx(row.year);
      fm.cover_locked = true;
      fm.own_cover = true;
    });
  },
};
