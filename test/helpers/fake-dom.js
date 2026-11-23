'use strict';
/* Tiny stand-in for Obsidian's DOM helpers (createDiv, createEl…) used to render the dashboard in tests. */
class FakeElement {
  constructor(tag, options = {}) {
    this.tag = tag;
    this.cls = options.cls || '';
    this.text = options.text || '';
    this.attr = { ...(options.attr || {}) };
    this.children = [];
    this.listeners = {};
    this.style = { setProperty() {} };
    this.open = false;
    this.isConnected = true;
  }
  createEl(tag, options) {
    const element = new FakeElement(tag, options);
    this.children.push(element);
    return element;
  }
  createDiv(options) {
    return this.createEl('div', options);
  }
  createSpan(options) {
    return this.createEl('span', options);
  }
  empty() {
    this.children = [];
  }
  addClass() {}
  toggleClass() {}
  setText(text) {
    this.text = text;
  }
  setAttribute(key, value) {
    this.attr[key] = value;
  }
  addEventListener(name, fn) {
    this.listeners[name] = fn;
  }
  findAll(predicate, out = []) {
    if (predicate(this)) out.push(this);
    for (const child of this.children) child.findAll(predicate, out);
    return out;
  }
  byClass(cls) {
    return this.findAll((el) => el.cls.split(' ').includes(cls));
  }
}
module.exports = { FakeElement };
