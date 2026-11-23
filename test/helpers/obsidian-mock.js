'use strict';
/*
 * Minimal in-memory stand-in for the Obsidian API, enough to run the plugin's
 * logic in Node without Obsidian. Only what the plugin uses is implemented.
 */
const YAML = require('yaml');

class TAbstractFile {
  constructor(vault, path) {
    this.vault = vault;
    this.path = path;
  }
  get name() {
    return this.path.split('/').pop();
  }
}
class TFile extends TAbstractFile {
  get basename() {
    return this.name.replace(/\.[^.]+$/, '');
  }
  get extension() {
    return (this.name.split('.').pop() || '').toLowerCase();
  }
  get stat() {
    const data = this.vault.files.get(this.path);
    return { size: typeof data === 'string' ? Buffer.byteLength(data) : data?.byteLength || 0 };
  }
}
class TFolder extends TAbstractFile {
  get children() {
    const prefix = this.path ? `${this.path}/` : '';
    const direct = new Set();
    for (const path of [...this.vault.files.keys(), ...this.vault.folders]) {
      if (!path.startsWith(prefix) || path === this.path) continue;
      direct.add(prefix + path.slice(prefix.length).split('/')[0]);
    }
    return [...direct].map((path) => this.vault.getAbstractFileByPath(path)).filter(Boolean);
  }
}

const normalizePath = (path) =>
  String(path || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');

const notices = [];
class Notice {
  constructor(message) {
    this.message = message;
    notices.push(String(message));
  }
  setMessage(message) {
    this.message = message;
    notices.push(String(message));
  }
  hide() {}
}

class Component {}
class Plugin extends Component {
  constructor(app, manifest) {
    super();
    this.app = app;
    this.manifest = manifest;
    this.commands = [];
  }
  addCommand(command) {
    this.commands.push(command);
  }
  registerEvent() {}
  registerView() {}
  addRibbonIcon() {}
  registerMarkdownCodeBlockProcessor() {}
  addSettingTab() {}
  async loadData() {
    return this.__data || {};
  }
  async saveData(data) {
    this.__data = data;
  }
}
class Modal {
  constructor(app) {
    this.app = app;
  }
  open() {}
  close() {}
}
class PluginSettingTab {}
class Setting {}
class ItemView {}

const splitFrontmatter = (content) => {
  const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? { match, data: YAML.parse(match[1]) || {} } : { match: null, data: {} };
};

function createApp(initialFiles = {}) {
  const vault = {
    files: new Map(),
    folders: new Set(),
    trashed: [],
    handlers: {},
    on(name, fn) {
      (this.handlers[name] = this.handlers[name] || []).push(fn);
      return {};
    },
    getAbstractFileByPath(path) {
      path = normalizePath(path);
      if (this.files.has(path)) return new TFile(this, path);
      if (this.folders.has(path)) return new TFolder(this, path);
      return null;
    },
    addParents(path) {
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) this.folders.add(parts.slice(0, i).join('/'));
    },
    write(path, data) {
      path = normalizePath(path);
      this.addParents(path);
      this.files.set(path, data);
      return new TFile(this, path);
    },
    async create(path, data) {
      if (this.files.has(normalizePath(path))) throw new Error(`File exists: ${path}`);
      return this.write(path, data);
    },
    async createFolder(path) {
      this.folders.add(normalizePath(path));
      this.addParents(normalizePath(path));
    },
    async read(file) {
      return this.files.get(file.path);
    },
    async readBinary(file) {
      const data = this.files.get(file.path);
      return typeof data === 'string' ? new TextEncoder().encode(data).buffer : data;
    },
    async modify(file, data) {
      this.files.set(file.path, data);
    },
    async process(file, fn) {
      const next = fn(this.files.get(file.path));
      this.files.set(file.path, next);
      return next;
    },
    getResourcePath(file) {
      return `app://local/${file.path}`;
    },
    adapter: null,
  };
  vault.adapter = {
    async exists(path) {
      path = normalizePath(path);
      return vault.files.has(path) || vault.folders.has(path);
    },
    async read(path) {
      return vault.files.get(normalizePath(path));
    },
    async write(path, data) {
      vault.write(path, data);
    },
    async writeBinary(path, data) {
      vault.write(path, data instanceof ArrayBuffer ? data : data.buffer || data);
    },
    async readBinary(path) {
      return vault.files.get(normalizePath(path));
    },
    async remove(path) {
      vault.files.delete(normalizePath(path));
    },
    async list(path) {
      const prefix = `${normalizePath(path)}/`;
      return { files: [...vault.files.keys()].filter((p) => p.startsWith(prefix)), folders: [] };
    },
  };
  const app = {
    vault,
    metadataCache: {
      on() {
        return {};
      },
      getFileCache(file) {
        const content = vault.files.get(file.path);
        return typeof content === 'string' ? { frontmatter: splitFrontmatter(content).data } : null;
      },
    },
    fileManager: {
      async processFrontMatter(file, fn) {
        const content = vault.files.get(file.path) || '';
        const { match, data } = splitFrontmatter(content);
        fn(data);
        const head = `---\n${YAML.stringify(data).trimEnd()}\n---`;
        vault.files.set(
          file.path,
          match ? head + content.slice(match[0].length) : `${head}\n${content}`
        );
      },
      async renameFile(file, newPath) {
        const data = vault.files.get(file.path);
        vault.files.delete(file.path);
        file.path = normalizePath(newPath);
        vault.write(file.path, data);
      },
      async trashFile(file) {
        vault.files.delete(file.path);
        vault.trashed.push(file.path);
      },
    },
    workspace: {
      on() {
        return {};
      },
      getLeavesOfType() {
        return [];
      },
      getActiveFile() {
        return null;
      },
    },
  };
  for (const [path, data] of Object.entries(initialFiles)) vault.write(path, data);
  return app;
}

module.exports = {
  TFile,
  TFolder,
  Plugin,
  PluginSettingTab,
  Setting,
  Modal,
  ItemView,
  Notice,
  normalizePath,
  requestUrl: async () => {
    throw new Error('Network access is disabled in tests');
  },
  parseYaml: (text) => YAML.parse(text),
  stringifyYaml: (data) => YAML.stringify(data),
  createApp,
  notices,
};
