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
  showAtMouseEvent() {}
}
export class ItemView { constructor(leaf) { this.leaf = leaf; this.contentEl = mk("div"); this.app = window.__app; } }
export class PluginSettingTab { constructor(app) { this.app = app; this.containerEl = mk("div"); } }

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
