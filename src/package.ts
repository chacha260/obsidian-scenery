import { App, normalizePath } from "obsidian";
import type { SceneLayer } from "./types";

export const MANIFEST_FILE = "scenery.json";
/** Manifest of a Wallpaper Engine web wallpaper, read as a fallback. */
export const WE_MANIFEST_FILE = "project.json";

export interface PackageProperty {
  type: "slider" | "color" | "toggle" | "select" | "text";
  label?: string;
  description?: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  /** For select: a list of values, or a value → label map. */
  options?: string[] | Record<string, string>;
}

export interface PackageManifest {
  name?: string;
  author?: string;
  version?: string;
  description?: string;
  /** HTML file to load, relative to the package folder. Defaults to index.html. */
  entry?: string;
  properties?: Record<string, PackageProperty>;
  /** "note": the wallpaper asks to be told which note is open. */
  permissions?: string[];
  /** "scene": the folder holds an exported scene (layers) instead of a page. */
  type?: string;
  layers?: SceneLayer[];
  /** Set when converted from a Wallpaper Engine project.json. Lists the colour property keys. */
  compat?: { colors: string[] };
}

export interface NoteInfo {
  name: string;
  path: string;
}

export interface PackageState {
  props: Record<string, unknown>;
  theme: Record<string, string | boolean>;
  note: NoteInfo | null;
  paused: boolean;
  pointer: { x: number; y: number };
  /** Present for Wallpaper Engine pages: drives the compatibility bridge in the shim. */
  we?: { colors: string[]; fps: number };
}

export function makeState(
  manifest: PackageManifest,
  values: Record<string, unknown> | undefined,
  env: { doc: Document; paused: boolean; pointer: { x: number; y: number }; note: NoteInfo | null; fps: number }
): PackageState {
  return {
    props: resolveValues(manifest, values),
    theme: readTheme(env.doc),
    note: env.note,
    paused: env.paused,
    pointer: env.pointer,
    ...(manifest.compat ? { we: { colors: manifest.compat.colors, fps: env.fps } } : {}),
  };
}

export async function hasManifest(app: App, folder: string): Promise<boolean> {
  const { adapter } = app.vault;
  return (
    (await adapter.exists(normalizePath(`${folder}/${MANIFEST_FILE}`))) ||
    (await adapter.exists(normalizePath(`${folder}/${WE_MANIFEST_FILE}`)))
  );
}

interface WeProperty {
  type?: string;
  text?: string;
  value?: unknown;
  min?: number;
  max?: number;
  step?: number;
  fraction?: boolean;
  order?: number;
  options?: { label?: string; value?: unknown }[];
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, "").trim();

/** Wallpaper Engine colours are "r g b" with 0..1 components. */
function weColorToHex(value: unknown): string {
  const parts = String(value ?? "1 1 1").trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return "#ffffff";
  return "#" + parts.slice(0, 3).map((n) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, "0")).join("");
}

/** Map a Wallpaper Engine web wallpaper's project.json onto our manifest. */
function fromWallpaperEngine(project: Record<string, unknown>): PackageManifest {
  const general = (project.general ?? {}) as { properties?: Record<string, WeProperty> };
  const properties: Record<string, PackageProperty> = {};
  const colors: string[] = [];
  const entries = Object.entries(general.properties ?? {}).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
  for (const [key, p] of entries) {
    const text = stripTags(String(p.text ?? key));
    const label = text === "ui_browse_properties_scheme_color" ? "Scheme color" : text || key;
    if (p.type === "slider") {
      const min = p.min ?? 0;
      const max = p.max ?? 100;
      properties[key] = { type: "slider", label, min, max, step: p.step ?? (p.fraction ? (max - min) / 100 : 1), default: p.value };
    } else if (p.type === "color") {
      colors.push(key);
      properties[key] = { type: "color", label, default: weColorToHex(p.value) };
    } else if (p.type === "bool") {
      properties[key] = { type: "toggle", label, default: p.value };
    } else if (p.type === "combo") {
      const options = Object.fromEntries((p.options ?? []).map((o) => [String(o.value), stripTags(String(o.label ?? o.value))]));
      properties[key] = { type: "select", label, options, default: String(p.value) };
    } else if (p.type === "textinput") {
      properties[key] = { type: "text", label, default: p.value };
    }
    // Other types (plain labels, file and directory pickers) have no equivalent here.
  }
  return {
    name: typeof project.title === "string" ? project.title : undefined,
    description: "Wallpaper Engine",
    entry: typeof project.file === "string" ? project.file : "index.html",
    properties,
    compat: { colors },
  };
}

export async function loadManifest(app: App, folder: string): Promise<PackageManifest> {
  const { adapter } = app.vault;
  const own = normalizePath(`${folder}/${MANIFEST_FILE}`);
  const foreign = normalizePath(`${folder}/${WE_MANIFEST_FILE}`);
  const useOwn = await adapter.exists(own);
  if (!useOwn && !(await adapter.exists(foreign))) throw new Error(`${MANIFEST_FILE} not found in "${folder}"`);
  const data: unknown = JSON.parse(await adapter.read(useOwn ? own : foreign));
  if (typeof data !== "object" || data === null) throw new Error("the manifest must be a JSON object");
  return useOwn ? (data as PackageManifest) : fromWallpaperEngine(data as Record<string, unknown>);
}

export async function loadPackage(app: App, folder: string) {
  const manifest = await loadManifest(app, folder);
  const entry = normalizePath(`${folder}/${manifest.entry || "index.html"}`);
  const html = await app.vault.adapter.read(entry);
  // Relative URLs in the page resolve against the folder that holds the entry file.
  const baseUrl = app.vault.adapter.getResourcePath(entry).split("?")[0].replace(/[^/]*$/, "");
  return { manifest, html, baseUrl };
}

export function selectOptions(p: PackageProperty): Record<string, string> {
  if (Array.isArray(p.options)) return Object.fromEntries(p.options.map((o) => [String(o), String(o)]));
  return p.options ?? {};
}

/** Saved values merged over the manifest defaults, coerced to each property's type. */
export function resolveValues(manifest: PackageManifest, saved: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, p] of Object.entries(manifest.properties ?? {})) {
    const value = saved[key] ?? p.default;
    if (p.type === "slider") {
      const min = p.min ?? 0;
      const max = p.max ?? 100;
      const n = Number(value);
      out[key] = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
    } else if (p.type === "toggle") {
      out[key] = Boolean(value);
    } else if (p.type === "select") {
      const options = Object.keys(selectOptions(p));
      out[key] = options.includes(String(value)) ? String(value) : options[0] ?? "";
    } else if (p.type === "color") {
      out[key] = typeof value === "string" ? value : "#ffffff";
    } else {
      out[key] = value == null ? "" : String(value);
    }
  }
  return out;
}

const THEME_VARS = {
  accent: "--interactive-accent",
  background: "--background-primary",
  backgroundAlt: "--background-secondary",
  text: "--text-normal",
  textMuted: "--text-muted",
} as const;

/** Theme colours as concrete rgb() strings a canvas can use. */
export function readTheme(doc: Document): Record<string, string | boolean> {
  const probe = doc.body.createDiv();
  const theme: Record<string, string | boolean> = { dark: doc.body.classList.contains("theme-dark") };
  for (const [key, cssVar] of Object.entries(THEME_VARS)) {
    probe.style.color = `var(${cssVar})`;
    theme[key] = (doc.defaultView ?? window).getComputedStyle(probe).color;
  }
  probe.remove();
  return theme;
}

/**
 * Runs inside the wallpaper page before its own scripts. Exposes `window.scenery`
 * and holds requestAnimationFrame callbacks while the wallpaper is paused, so
 * packages stop drawing in the background without any effort from their authors.
 */
const SHIM = `(function () {
  var state = __STATE__;
  var handlers = {};
  var held = new Map();
  var nextId = -1;
  var raf = window.requestAnimationFrame.bind(window);
  var caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    if (!state.paused) return raf(cb);
    held.set(nextId, cb);
    return nextId--;
  };
  window.cancelAnimationFrame = function (id) {
    if (id < 0) held.delete(id);
    else caf(id);
  };
  function emit(key) {
    (handlers[key] || []).slice().forEach(function (fn) {
      try { fn(state[key]); } catch (e) { console.error(e); }
    });
  }
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.source !== window.parent || !m || m.scenery !== 1) return;
    state[m.key] = m.value;
    if (m.key === "paused" && !m.value) {
      var waiting = Array.from(held.values());
      held.clear();
      waiting.forEach(function (cb) { raf(cb); });
    }
    emit(m.key);
  });
  // Sandboxed pages may not touch real storage; give them a throwaway one instead of an exception.
  ["localStorage", "sessionStorage"].forEach(function (name) {
    try { void window[name]; return; } catch (e) {}
    var data = {};
    Object.defineProperty(window, name, { configurable: true, value: {
      getItem: function (k) { return k in data ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      clear: function () { data = {}; },
      key: function (i) { return Object.keys(data)[i] || null; },
      get length() { return Object.keys(data).length; },
    } });
  });

  // ---- Wallpaper Engine web wallpaper bridge ----
  if (state.we) {
    var listener = function () { return window.wallpaperPropertyListener || {}; };
    var call = function (name, arg) {
      var fn = listener()[name];
      if (typeof fn === "function") { try { fn(arg); } catch (e) { console.error(e); } }
    };
    var weColor = function (hex) {
      var n = parseInt(String(hex).slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return +(v / 255).toFixed(4); }).join(" ");
    };
    var weProps = function () {
      var out = {};
      Object.keys(state.props).forEach(function (k) {
        out[k] = { value: state.we.colors.indexOf(k) >= 0 ? weColor(state.props[k]) : state.props[k] };
      });
      return out;
    };
    // No audio capture here: listeners get silence so visualisers idle instead of breaking.
    var audioListeners = [];
    var silence = new Array(128).fill(0);
    window.wallpaperRegisterAudioListener = function (fn) { if (typeof fn === "function") audioListeners.push(fn); };
    setInterval(function () {
      if (!state.paused) audioListeners.forEach(function (fn) { try { fn(silence); } catch (e) {} });
    }, 33);
    ["wallpaperRegisterMediaStatusListener", "wallpaperRegisterMediaPropertiesListener", "wallpaperRegisterMediaThumbnailListener",
      "wallpaperRegisterMediaPlaybackListener", "wallpaperRegisterMediaTimelineListener", "wallpaperRequestRandomFileForProperty"
    ].forEach(function (name) { window[name] = function () {}; });
    window.addEventListener("load", function () {
      call("applyGeneralProperties", { fps: state.we.fps });
      call("applyUserProperties", weProps());
      call("setPaused", state.paused);
    });
    (handlers.props = handlers.props || []).push(function () { call("applyUserProperties", weProps()); });
    (handlers.paused = handlers.paused || []).push(function (p) { call("setPaused", p); });
  }

  window.scenery = {
    get props() { return state.props; },
    get theme() { return state.theme; },
    get note() { return state.note; },
    get paused() { return state.paused; },
    get pointer() { return state.pointer; },
    on: function (key, fn) {
      (handlers[key] = handlers[key] || []).push(fn);
      if (key in state) fn(state[key]);
      return function () {
        handlers[key] = handlers[key].filter(function (h) { return h !== fn; });
      };
    },
  };
})();`;

/** The page's HTML with a <base> for relative URLs and the API shim injected ahead of its scripts. */
export function buildDocument(html: string, baseUrl: string, state: PackageState): string {
  // "<" is escaped so no value can close the script element early.
  const json = JSON.stringify(state).replace(/</g, "\\u003c");
  const inject = `<base href="${baseUrl.replace(/"/g, "&quot;")}"><script>${SHIM.replace("__STATE__", () => json)}</script>`;
  for (const anchor of [/<head[^>]*>/i, /<html[^>]*>/i, /<!doctype[^>]*>/i]) {
    const m = anchor.exec(html);
    if (m) return html.slice(0, m.index + m[0].length) + inject + html.slice(m.index + m[0].length);
  }
  return inject + html;
}

/** A sandboxed frame running one package, plus the channel to talk to it. */
export class PackageFrame {
  readonly frame: HTMLIFrameElement;
  manifest: PackageManifest | null = null;
  /** Settles when the page has loaded; rejects if the package cannot be read. */
  readonly loaded: Promise<void>;

  constructor(app: App, parent: HTMLElement, folder: string, state: (manifest: PackageManifest) => PackageState) {
    const frame = (this.frame = parent.createEl("iframe", { cls: "scenery-media" }));
    // Scripts may run, but the page gets an opaque origin: no access to the vault or the app.
    frame.setAttribute("sandbox", "allow-scripts");
    this.loaded = (async () => {
      const { manifest, html, baseUrl } = await loadPackage(app, folder);
      if (manifest.type === "scene") throw new Error("this folder is an exported scene; add it from the library instead");
      this.manifest = manifest;
      const done = new Promise<void>((resolve) => frame.addEventListener("load", () => resolve(), { once: true }));
      frame.srcdoc = buildDocument(html, baseUrl, state(manifest));
      await done;
    })();
  }

  post(key: keyof PackageState, value: unknown) {
    // The frame is sandboxed with an opaque origin, so "*" is the only target that reaches it.
    this.frame.contentWindow?.postMessage({ scenery: 1, key, value }, "*");
  }
}
