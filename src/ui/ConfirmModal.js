import { Modal } from 'obsidian';

/*
 * Obsidian-styled confirmation dialog (replaces window.confirm, which looks
 * foreign and is unreliable on mobile). Resolves to true or false.
 */
export class ConfirmModal extends Modal {
  /**
   * @param {import('obsidian').App} app
   * @param {{ message: string, confirmText: string, cancelText: string, warning?: boolean }} options
   */
  constructor(app, { message, confirmText, cancelText, warning = false }) {
    super(app);
    this.message = message;
    this.confirmText = confirmText;
    this.cancelText = cancelText;
    this.warning = warning;
    this.result = false;
    /** @type {(value: boolean) => void} */
    this.resolve = () => {};
    /** @type {Promise<boolean>} */
    this.promise = new Promise((resolve) => (this.resolve = resolve));
  }
  onOpen() {
    const c = this.contentEl;
    c.empty();
    for (const paragraph of this.message.split('\n')) c.createEl('p', { text: paragraph });
    const actions = c.createDiv({ cls: 'twoeuro-actions' });
    actions.createEl('button', { text: this.cancelText }).onclick = () => this.close();
    const confirm = actions.createEl('button', {
      text: this.confirmText,
      cls: this.warning ? 'mod-warning' : 'mod-cta',
    });
    confirm.onclick = () => {
      this.result = true;
      this.close();
    };
    window.setTimeout(() => confirm.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
    this.resolve(this.result);
  }
  /**
   * @param {import('obsidian').App} app
   * @param {{ message: string, confirmText: string, cancelText: string, warning?: boolean }} options
   * @returns {Promise<boolean>}
   */
  static ask(app, options) {
    const modal = new ConfirmModal(app, options);
    modal.open();
    return modal.promise;
  }
}
