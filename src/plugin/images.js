import { Notice, TFile } from 'obsidian';
import { COVER_MAX_SIZE, COVER_WEBP_QUALITY } from '../constants.js';
import { tx, clean, isTrue, countryName } from '../utils.js';
import { removeBackgroundPixels } from '../images/background.js';

export const imagesMethods = {
  coverFileStem(row) {
    const parts = [
      countryName(row.country),
      tx(row.year),
      tx(row.coin_type) === 'national' ? 'National' : 'Comm',
    ];
    if (tx(row.coin_type) === 'commemorative' && tx(row.title)) {
      const extra = tx(row.title)
        .replace(/^2\s*Euros?\s*[-–:]?\s*/i, '')
        .trim();
      if (extra) parts.push(extra);
    }
    if (tx(row.mint_mark)) parts.push(tx(row.mint_mark));
    return parts
      .map((part) => clean(part).replace(/\s+/g, '-').replace(/-+/g, '-'))
      .filter(Boolean)
      .join('-');
  },

  async uniqueCoverPath(desired, currentPath = '') {
    if (desired === currentPath || !(await this.app.vault.adapter.exists(desired))) return desired;
    const dot = desired.lastIndexOf('.'),
      base = dot >= 0 ? desired.slice(0, dot) : desired,
      ext = dot >= 0 ? desired.slice(dot) : '';
    let n = 2,
      candidate = `${base}-${n}${ext}`;
    while (candidate !== currentPath && (await this.app.vault.adapter.exists(candidate))) {
      n++;
      candidate = `${base}-${n}${ext}`;
    }
    return candidate;
  },

  async processBackgroundForRow(row) {
    const coinFile = row?.file;
    if (!(coinFile instanceof TFile)) return { ok: false, reason: 'no-file' };
    const allRows = this.getRows(),
      referenceIndex = this.buildReferenceCoverIndex(allRows),
      resolution = this.resolveDisplayCover(row, referenceIndex);
    let sourceRow = row,
      sourcePath = this.localPath(row),
      sourceFile = sourcePath && this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(sourceFile instanceof TFile) && resolution?.source) {
      sourceRow = resolution.source;
      sourcePath = this.localPath(sourceRow);
      sourceFile = sourcePath && this.app.vault.getAbstractFileByPath(sourcePath);
    }
    if (!(sourceFile instanceof TFile)) return { ok: false, reason: 'no-cover' };
    const binary = await this.app.vault.readBinary(sourceFile),
      image = await this.loadImageFromArrayBuffer(binary),
      canvas = this.makeTransparentBackground(image),
      pngPath = await this.saveProcessedCover(row, canvas);
    await this.app.fileManager.processFrontMatter(coinFile, (fm) => {
      fm.cover = `[[${pngPath}]]`;
      fm.reference_year = tx(row.year);
      fm.cover_locked = true;
    });
    return { ok: true, pngPath, usedReference: sourceRow.file?.path !== row.file.path };
  },

  async removeBackgroundFromSelectedCoins() {
    const rows = this.getSelectedCoinFiles();
    if (!rows.length) {
      new Notice(this.t('notice.noSelection'));
      return;
    }
    let done = 0,
      skipped = 0,
      errors = 0;
    for (const row of rows) {
      try {
        const result = await this.processBackgroundForRow(row);
        if (result.ok) done++;
        else {
          skipped++;
          console.warn('Batch background skipped', row.file?.path, result.reason);
        }
      } catch (error) {
        errors++;
        console.error('Batch background removal', row.file?.path, error);
      }
    }
    this._lastSavedOverride = null;
    this.clearCoinSelection();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await this.refreshDashboards();
    this.refreshFilterViews();
    new Notice(this.t('notice.batchBackground', { done, skipped, errors }));
  },

  async loadImageFromArrayBuffer(arrayBuffer) {
    const blob = new Blob([arrayBuffer]);
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image decode failed'));
        image.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  },

  makeTransparentBackground(image) {
    const canvas = document.createElement('canvas'),
      naturalWidth = image.naturalWidth || image.width,
      naturalHeight = image.naturalHeight || image.height,
      scale = Math.min(1, COVER_MAX_SIZE / Math.max(naturalWidth, naturalHeight, 1));
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas context unavailable');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    removeBackgroundPixels(frame.data, canvas.width, canvas.height);
    context.putImageData(frame, 0, 0);
    return canvas;
  },

  makeCatalogCoinCanvas(image) {
    const segmented = this.makeTransparentBackground(image),
      source = segmented
        .getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, segmented.width, segmented.height),
      pixels = source.data,
      w = segmented.width,
      h = segmented.height;
    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (pixels[(y * w + x) * 4 + 3] > 40) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    if (maxX < minX || maxY < minY) throw new Error('Coin boundary not detected');
    const bw = maxX - minX + 1,
      bh = maxY - minY + 1,
      margin = 0.01,
      cropX = Math.max(0, minX - bw * margin),
      cropY = Math.max(0, minY - bh * margin),
      cropW = Math.min(w - cropX, bw * (1 + 2 * margin)),
      cropH = Math.min(h - cropY, bh * (1 + 2 * margin));
    const size = Math.min(COVER_MAX_SIZE, Math.max(768, Math.round(Math.max(cropW, cropH)))),
      canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(segmented, cropX, cropY, cropW, cropH, 0, 0, size, size);
    ctx.restore();
    const frame = ctx.getImageData(0, 0, size, size),
      out = frame.data,
      cx = size / 2,
      cy = size / 2,
      radius = size / 2 - 2,
      feather = 2.5;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4,
          dist = Math.hypot(x - cx, y - cy);
        if (dist > radius) {
          out[i + 3] =
            dist > radius + feather
              ? 0
              : Math.round(255 * Math.max(0, (radius + feather - dist) / feather));
          continue;
        }
        if (out[i + 3] === 0) continue;
        const lum = 0.2126 * out[i] + 0.7152 * out[i + 1] + 0.0722 * out[i + 2],
          contrast = 1.04,
          highlight = lum > 145 ? Math.min(6, ((lum - 145) / 110) * 6) : 0;
        out[i] = Math.max(0, Math.min(255, (out[i] - 128) * contrast + 128 + highlight));
        out[i + 1] = Math.max(0, Math.min(255, (out[i + 1] - 128) * contrast + 128 + highlight));
        out[i + 2] = Math.max(0, Math.min(255, (out[i + 2] - 128) * contrast + 128 + highlight));
      }
    ctx.putImageData(frame, 0, 0);
    return canvas;
  },

  async processCatalogPresetForRow(row) {
    const coinFile = row?.file;
    if (!(coinFile instanceof TFile)) return { ok: false, reason: 'no-file' };
    const allRows = this.getRows(),
      referenceIndex = this.buildReferenceCoverIndex(allRows),
      resolution = this.resolveDisplayCover(row, referenceIndex);
    let sourcePath = this.localPath(row),
      sourceFile = sourcePath && this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(sourceFile instanceof TFile) && resolution?.source) {
      sourcePath = this.localPath(resolution.source);
      sourceFile = sourcePath && this.app.vault.getAbstractFileByPath(sourcePath);
    }
    if (!(sourceFile instanceof TFile)) return { ok: false, reason: 'no-cover' };
    const binary = await this.app.vault.readBinary(sourceFile),
      image = await this.loadImageFromArrayBuffer(binary),
      canvas = this.makeCatalogCoinCanvas(image),
      pngPath = await this.saveProcessedCover(row, canvas);
    await this.app.fileManager.processFrontMatter(coinFile, (fm) => {
      fm.cover = `[[${pngPath}]]`;
      fm.reference_year = tx(row.year);
      fm.cover_locked = true;
      fm.image_preset = 'catalog-coin';
    });
    return {
      ok: true,
      pngPath,
      override: {
        ...row,
        file: coinFile,
        cover: `[[${pngPath}]]`,
        reference_year: tx(row.year),
        cover_locked: true,
        own_cover: isTrue(row.own_cover),
        image_preset: 'catalog-coin',
      },
    };
  },

  async processSelectedImages(preset) {
    if (preset === 'catalog') return this.applyCatalogPresetToSelectedCoins();
    return this.removeBackgroundFromSelectedCoins();
  },

  async applyCatalogPresetToSelectedCoins() {
    const rows = this.getSelectedCoinFiles();
    if (!rows.length) {
      new Notice(this.t('notice.noSelection'));
      return;
    }
    let done = 0,
      skipped = 0,
      errors = 0;
    this._pendingRowOverrides = new Map();
    for (const row of rows) {
      try {
        const result = await this.processCatalogPresetForRow(row);
        if (result.ok) {
          done++;
          this._pendingRowOverrides.set(row.file.path, result.override);
        } else skipped++;
      } catch (error) {
        errors++;
        console.error('Catalog preset', row.file?.path, error);
      }
    }
    this._lastSavedOverride = null;
    this.clearCoinSelection();
    await this.refreshDashboards();
    this.refreshFilterViews();
    window.setTimeout(() => {
      this._pendingRowOverrides = new Map();
    }, 1500);
    new Notice(this.t('notice.batchCatalog', { done, skipped, errors }));
  },

  async applyCatalogPresetToCurrentCoin() {
    const file = this.getCurrentCoinFile();
    if (!file) {
      new Notice(this.t('notice.noCurrentCoin'));
      return;
    }
    const row = this.getRows().find((item) => item.file.path === file.path);
    if (!row) {
      new Notice(this.t('notice.noCurrentCoin'));
      return;
    }
    try {
      const result = await this.processCatalogPresetForRow(row);
      if (!result.ok) {
        new Notice(this.t('notice.noCover'));
        return;
      }
      this._pendingRowOverrides = new Map([[row.file.path, result.override]]);
      await this.refreshDashboards();
      window.setTimeout(() => {
        this._pendingRowOverrides = new Map();
      }, 1500);
      new Notice(this.t('notice.catalogDone'));
    } catch (error) {
      console.error('Catalog preset', error);
      new Notice(this.t('notice.backgroundError', { message: error?.message || error }));
    }
  },

  /*
   * Encodes as WebP (much smaller than PNG, keeps transparency). Falls back to
   * PNG where the platform cannot encode WebP (older iOS/Safari WebViews).
   */
  async canvasToCoverBlob(canvas) {
    const webp = await new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/webp', COVER_WEBP_QUALITY)
    );
    if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' };
    return { blob: await this.canvasToPngBlob(canvas), ext: 'png' };
  },

  resizeImageToCanvas(image) {
    const naturalWidth = image.naturalWidth || image.width,
      naturalHeight = image.naturalHeight || image.height,
      scale = Math.min(1, COVER_MAX_SIZE / Math.max(naturalWidth, naturalHeight, 1)),
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  },

  async saveProcessedCover(row, canvas) {
    await this.ensureFolder(this.covers());
    const { blob, ext } = await this.canvasToCoverBlob(canvas),
      stem = this.coverFileStem(row),
      oldPath = this.localPath(row),
      path = await this.uniqueCoverPath(this.join(this.covers(), `${stem}.${ext}`), oldPath);
    await this.app.vault.adapter.writeBinary(path, new Uint8Array(await blob.arrayBuffer()));
    /*
     * Remove the previous processed version of this coin's cover (same name,
     * different extension, e.g. an old 5 MB PNG) when no other coin uses it.
     * Original downloads and custom covers have other names and are kept.
     */
    if (oldPath && oldPath !== path) {
      const oldName = oldPath.split('/').pop() || '',
        oldStem = oldName.replace(/\.[^.]+$/, '').replace(/-\d+$/, ''),
        oldFile = this.app.vault.getAbstractFileByPath(oldPath),
        usedElsewhere = this.getRows().some(
          (other) => other.file.path !== row.file.path && this.localPath(other) === oldPath
        );
      if (
        oldStem === stem &&
        oldPath.startsWith(`${this.covers()}/`) &&
        oldFile instanceof TFile &&
        !usedElsewhere
      ) {
        try {
          await this.app.fileManager.trashFile(oldFile);
        } catch (error) {
          console.warn('Cannot remove previous cover', oldPath, error);
        }
      }
    }
    return path;
  },

  canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
        'image/png'
      )
    );
  },

  async removeBackgroundFromCurrentCoin() {
    const coinFile = this.getCurrentCoinFile();
    if (!coinFile) {
      new Notice(this.t('notice.noCurrentCoin'));
      return;
    }
    try {
      const row = this.getRows().find((item) => item.file.path === coinFile.path);
      if (!row) {
        new Notice(this.t('notice.noCurrentCoin'));
        return;
      }
      const result = await this.processBackgroundForRow(row);
      if (!result.ok) {
        new Notice(this.t('notice.noCover'));
        return;
      }
      this._lastSavedOverride = {
        file: coinFile,
        data: { ...row, file: coinFile, reference_year: tx(row.year), cover_locked: true },
      };
      await this.refreshDashboards();
      new Notice(this.t('notice.backgroundRemoved', { year: tx(row.year) }));
    } catch (error) {
      console.error('2 Euro background removal', error);
      new Notice(this.t('notice.backgroundError', { message: error?.message || error }));
    }
  },
};
