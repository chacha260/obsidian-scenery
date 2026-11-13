// The Studio reuses the plugin's rendering code, which imports a few things from
// "obsidian". In the browser build that import is pointed here instead.

type ElOptions = { cls?: string; text?: string };

// Obsidian defines these globals; the shared code and the Studio use them the same way.
const globals = window as unknown as { activeDocument: Document; activeWindow: Window };
globals.activeDocument = window.document;
globals.activeWindow = window;

function make(tag: string, o: ElOptions = {}, parent?: Node): HTMLElement {
  // This is the Studio's stand-in for Obsidian's createEl itself, so it has to create the element directly.
  const el = (parent?.ownerDocument ?? activeDocument).createElement(tag);
  if (o.cls) el.className = o.cls;
  if (o.text) el.textContent = o.text;
  parent?.appendChild(el);
  return el;
}

// Obsidian adds these helpers to every element; the shared code relies on them.
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
proto.createDiv = function (this: HTMLElement, o?: ElOptions) { return make("div", o, this); };
proto.createEl = function (this: HTMLElement, tag: string, o?: ElOptions) { return make(tag, o, this); };
proto.createSpan = function (this: HTMLElement, o?: ElOptions) { return make("span", o, this); };
proto.addClass = function (this: HTMLElement, c: string) { this.classList.add(c); };
proto.removeClass = function (this: HTMLElement, c: string) { this.classList.remove(c); };
proto.toggleClass = function (this: HTMLElement, c: string, v: boolean) { this.classList.toggle(c, v); };
proto.empty = function (this: HTMLElement) { this.replaceChildren(); };

export class TFile {
  constructor(public path: string) {}
}
export class TFolder {}
export const Platform = { resourcePathPrefix: "", isDesktopApp: false };
export const getLanguage = () => navigator.language || "en";
export const normalizePath = (p: string) => p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
