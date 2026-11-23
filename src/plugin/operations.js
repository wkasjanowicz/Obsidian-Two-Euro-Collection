import { Notice } from 'obsidian';

/*
 * Long-running operations (synchronization, prices, covers, conversions):
 * only one runs at a time, it can be aborted from the side panel or a
 * command, and it reports how many Numista requests it used.
 */
export const operationsMethods = {
  isOperationRunning() {
    return Boolean(this._operation);
  },

  async runOperation(fn) {
    if (this._operation) {
      new Notice(this.t('notice.operationRunning'));
      return null;
    }
    const operation = { aborted: false, requests: 0, notices: [] };
    this._operation = operation;
    this.refreshFilterViews();
    try {
      return await fn();
    } catch (error) {
      if (!error?.aborted) throw error;
      for (const notice of operation.notices) notice.hide();
      new Notice(this.t('notice.aborted'));
      await this.refreshDashboards();
      return null;
    } finally {
      this._operation = null;
      if (operation.requests)
        new Notice(
          this.t('notice.requestsUsed', {
            count: operation.requests,
            month: this.settings.numistaRequestCount,
          }),
          6000
        );
      this.refreshFilterViews();
    }
  },

  abortOperation() {
    if (!this._operation) return;
    this._operation.aborted = true;
    new Notice(this.t('notice.aborting'));
  },

  throwIfAborted() {
    if (!this._operation?.aborted) return;
    const error = new Error(this.t('notice.aborted'));
    error.aborted = true;
    throw error;
  },

  /* Persistent progress notice that is hidden automatically when aborted. */
  progressNotice(message) {
    const notice = new Notice(message, 0);
    this._operation?.notices.push(notice);
    return notice;
  },

  /* Counts Numista requests per calendar month (shown in settings). */
  countNumistaRequest() {
    const month = new Date().toISOString().slice(0, 7);
    if (this.settings.numistaRequestMonth !== month) {
      this.settings.numistaRequestMonth = month;
      this.settings.numistaRequestCount = 0;
    }
    this.settings.numistaRequestCount = (Number(this.settings.numistaRequestCount) || 0) + 1;
    if (this._operation) this._operation.requests++;
    this.scheduleSettingsSave();
  },
};
