// A small stand-in for the Obsidian API: just enough to run the plugin in a plain browser.
// Controls are real DOM inputs so tests can drive the settings UI the way a user would.

function mk(tag, o = {}, parent) {
  const e = (parent?.ownerDocument ?? document).createElement(tag);
  if (o.cls) e.className = o.cls;
  if (o.text) e.textContent = o.text;
  if (parent) parent.appendChild(e);
  return e;
}

/** Obsidian adds these helpers to elements in every window it opens. */
export function patchWindow(win) {
  const P = win.HTMLElement.prototype;
  P.createDiv = function (o) { return mk("div", o, this); };
  P.createEl = function (tag, o) { return mk(tag, o, this); };
  P.createSpan = function (o) { return mk("span", o, this); };
  P.addClass = function (c) { this.classList.add(c); };
  P.removeClass = function (c) { this.classList.remove(c); };
  P.toggleClass = function (c, v) { this.classList.toggle(c, v); };
  P.empty = function () { this.replaceChildren(); };
}
patchWindow(window);
// Obsidian also gives fragments these helpers, and exposes the focused window's document.
DocumentFragment.prototype.createSpan = function (o) { return mk("span", o, this); };
DocumentFragment.prototype.createEl = function (tag, o) { return mk(tag, o, this); };
window.activeDocument = document;

export class TFile {
  constructor(path) { this.path = path; this.name = path.split("/").pop(); this.basename = this.name.replace(/\.[^.]*$/, ""); }
}
export class TFolder {}
export class WorkspaceLeaf {}
export class Notice {
  constructor(message) {
    // Fragments are kept in the page so tests can press buttons inside them.
    this.el = mk("div", { cls: "notice" }, document.body);
    this.el.hidden = true;
    this.el.append(message);
    (window.__notices ||= []).push(this.el.textContent);
  }
  hide() { this.el.remove(); }
}
export const Platform = { resourcePathPrefix: location.origin + "/", isDesktopApp: true };
export const normalizePath = (p) => p.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
export const setIcon = (el, name) => { el.dataset.icon = name; };
export const debounce = (fn) => fn;
export const getLanguage = () => "en";

export class Modal {
  constructor(app) { this.app = app; this.contentEl = mk("div"); window.__modal = this; }
  setTitle() {}
  open() { this.onOpen?.(); }
  close() { this.onClose?.(); }
}
export class FuzzySuggestModal extends Modal { setPlaceholder() {} open() { window.__picker = this; } }
export class Menu {
  constructor() { this.items = []; window.__menu = this; }
  addItem(cb) {
    const item = { setTitle(t) { item.title = t; return item; }, setIcon() { return item; }, onClick(f) { item.click = f; return item; } };
    cb(item);
    this.items.push(item);
    return this;
  }
  addSeparator() { return this; }
  showAtMouseEvent() {}
  showAtPosition() {}
}
export class ItemView { constructor(leaf) { this.leaf = leaf; this.contentEl = mk("div"); this.app = window.__app; } }
// A stand-in for Obsidian's declarative settings renderer (1.13+): groups, lists with
// search / delete / add, controls bound to getControlValue / setControlValue, hand-drawn rows.
export class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app; this.plugin = plugin; this.containerEl = mk("div");
    this.settingItems = []; this.cleanups = []; this.refreshers = []; this.queries = new Map();
  }
  getSettingDefinitions() { return []; }
  getControlValue(key) { return this.plugin.settings[key]; }
  setControlValue(key, value) { this.plugin.settings[key] = value; }
  display() { this.update(); }
  update() {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = []; this.refreshers = [];
    this.settingItems = this.getSettingDefinitions();
    this.containerEl.replaceChildren();
    this.settingItems.forEach((def) => this.renderItem(this.containerEl, def, null, 0));
    this.refreshDomState();
  }
  refreshDomState() { for (const refresh of this.refreshers) refresh(); }
  watchVisible(el, def) {
    if (def.visible === undefined) return;
    this.refreshers.push(() => { el.hidden = !(typeof def.visible === "function" ? def.visible() : def.visible); });
  }
  renderItem(parent, def, list, index) {
    if (def.type === "page") {
      // The real app opens a page on its own screen; here it is laid out in place.
      const el = mk("div", { cls: "setting-page" }, parent);
      const entry = new Setting(el).setName(def.name);
      if (def.desc) entry.setDesc(def.desc);
      const value = mk("span", { cls: "setting-page-value" }, entry.controlEl);
      if (def.displayValue !== undefined) this.refreshers.push(() => { value.textContent = typeof def.displayValue === "function" ? def.displayValue() : def.displayValue; });
      (def.items || []).forEach((item, i) => this.renderItem(el, item, null, i));
      this.watchVisible(el, def);
      return el;
    }
    if (def.type === "group" || def.type === "list") {
      const el = mk("div", { cls: "setting-group " + (def.cls || "") }, parent);
      const head = new Setting(el).setName(def.heading || "").setHeading();
      const body = mk("div", { cls: "setting-items" }, el);
      const rows = (def.items || []).map((item, i) => ({ item, row: this.renderItem(body, item, def.type === "list" ? def : null, i) }));
      if (def.type === "list" && !rows.length && def.emptyState) mk("p", { cls: "setting-empty", text: def.emptyState }, body);
      if (def.search) {
        const input = mk("input", {}, head.controlEl); input.type = "search"; input.placeholder = def.search.placeholder || "";
        const key = def.heading || "";
        const apply = () => {
          this.queries.set(key, input.value);
          for (const { item, row } of rows) row.classList.toggle("is-filtered", !!input.value && item.searchable !== false && !def.search.match(item, input.value));
        };
        input.value = this.queries.get(key) || ""; input.addEventListener("input", apply); apply();
      }
      for (const cb of def.extraButtons || []) head.addExtraButton(cb);
      if (def.addItem) head.addExtraButton((b) => b.setIcon("plus").setTooltip(def.addItem.name).onClick((e) => def.addItem.action(e.currentTarget)));
      this.watchVisible(el, def);
      return el;
    }
    const setting = new Setting(parent).setName(def.name);
    if (def.desc) setting.setDesc(def.desc);
    if (def.control) this.renderControl(setting, def.control);
    else if (def.render) {
      // Obsidian may draw into a row it already has: do that here too, so leftovers show up in tests.
      const first = def.render(setting, { listEl: parent });
      if (first) first();
      setting.controlEl.replaceChildren();
      const cleanup = def.render(setting, { listEl: parent });
      if (cleanup) this.cleanups.push(cleanup);
    }
    else if (def.action) setting.settingEl.addEventListener("click", () => def.action(setting.settingEl, index));
    if (list && list.onDelete) setting.addExtraButton((b) => b.setIcon("trash-2").onClick(() => list.onDelete(index)));
    this.watchVisible(setting.settingEl, def);
    return setting.settingEl;
  }
  renderControl(setting, c) {
    const value = this.getControlValue(c.key) ?? c.defaultValue;
    const set = (v) => void this.setControlValue(c.key, v);
    if (c.type === "toggle") setting.addToggle((t) => t.setValue(!!value).onChange(set));
    else if (c.type === "dropdown") setting.addDropdown((d) => d.addOptions(c.options).setValue(value).onChange(set));
    else if (c.type === "color") setting.addColorPicker((p) => p.setValue(value).onChange(set));
    else if (c.type === "slider") setting.addSlider((sl) => { sl.setLimits(c.min, c.max, c.step).setValue(value); sl.sliderEl.addEventListener("input", () => set(Number(sl.sliderEl.value))); });
    else setting.addText((t) => t.setValue(value ?? "").onChange(set));
  }
}

function input(parent, type) { const i = mk("input", {}, parent); i.type = type; return i; }
function button(parent) {
  const b = mk("button", {}, parent);
  const c = {
    setButtonText(t) { b.textContent = t; return c; }, setIcon(n) { b.dataset.icon = n; return c; }, setTooltip(t) { b.title = t; return c; },
    setCta() { return c; }, setDisabled(d) { b.disabled = d; return c; }, onClick(f) { b.addEventListener("click", f); return c; },
  };
  return c;
}
export class Setting {
  constructor(el) {
    this.settingEl = mk("div", { cls: "setting-item" }, el);
    this.infoEl = mk("div", { cls: "setting-item-info" }, this.settingEl);
    this.nameEl = mk("div", { cls: "setting-item-name" }, this.infoEl);
    this.descEl = mk("div", { cls: "setting-item-description" }, this.infoEl);
    this.controlEl = mk("div", { cls: "setting-item-control" }, this.settingEl);
  }
  setName(n) { this.nameEl.textContent = n; return this; }
  setDesc(d) { this.descEl.textContent = d; return this; }
  setHeading() { this.settingEl.classList.add("setting-item-heading"); return this; }
  addText(cb) {
    const i = input(this.controlEl, "text");
    const c = { inputEl: i, setValue(v) { i.value = v; return c; }, getValue: () => i.value, setPlaceholder(p) { i.placeholder = p; return c; }, onChange(f) { i.addEventListener("input", () => f(i.value)); return c; } };
    cb(c); return this;
  }
  addSlider(cb) {
    const i = input(this.controlEl, "range");
    const c = { sliderEl: i, setLimits(a, b, s) { i.min = a; i.max = b; i.step = s; return c; }, setValue(v) { i.value = v; return c; }, setDynamicTooltip() { return c; }, onChange(f) { i.addEventListener("change", () => f(Number(i.value))); return c; } };
    cb(c); return this;
  }
  addToggle(cb) {
    const i = input(this.controlEl, "checkbox");
    const c = { setValue(v) { i.checked = v; return c; }, onChange(f) { i.addEventListener("change", () => f(i.checked)); return c; } };
    cb(c); return this;
  }
  addColorPicker(cb) {
    const i = input(this.controlEl, "color");
    const c = { setValue(v) { i.value = v; return c; }, onChange(f) { i.addEventListener("input", () => f(i.value)); return c; } };
    cb(c); return this;
  }
  addDropdown(cb) {
    const i = mk("select", {}, this.controlEl);
    const c = { addOption(v, t) { const o = mk("option", { text: t }, i); o.value = v; return c; }, addOptions(o) { for (const k in o) c.addOption(k, o[k]); return c; }, setValue(v) { i.value = v; return c; }, onChange(f) { i.addEventListener("change", () => f(i.value)); return c; } };
    cb(c); return this;
  }
  addButton(cb) { cb(button(this.controlEl)); return this; }
  addExtraButton(cb) { cb(button(this.controlEl)); return this; }
}

export class Plugin {
  constructor(app) { this.app = app; }
  loadData() { return null; }
  saveData(data) { window.__saved = JSON.parse(JSON.stringify(data)); }
  addSettingTab(tab) { window.__tab = tab; }
  addRibbonIcon() {}
  addCommand(c) { (window.__commands ||= {})[c.id] = c; }
  registerEvent() {}
  registerInterval() {}
  registerView(type, factory) { window.__viewFactory = factory; }
  registerDomEvent(target, event, fn) { target.addEventListener(event, fn); }
}
