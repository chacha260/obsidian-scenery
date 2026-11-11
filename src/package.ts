import { App, normalizePath } from "obsidian";

export const MANIFEST_FILE = "scenery.json";

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
}

export async function loadManifest(app: App, folder: string): Promise<PackageManifest> {
  const raw = await app.vault.adapter.read(normalizePath(`${folder}/${MANIFEST_FILE}`));
  const manifest = JSON.parse(raw) as PackageManifest;
  if (typeof manifest !== "object" || manifest === null) throw new Error(`${MANIFEST_FILE} must be an object`);
  return manifest;
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
export function readTheme(): Record<string, string | boolean> {
  const probe = document.body.createDiv();
  const theme: Record<string, string | boolean> = { dark: document.body.classList.contains("theme-dark") };
  for (const [key, cssVar] of Object.entries(THEME_VARS)) {
    probe.style.color = `var(${cssVar})`;
    theme[key] = getComputedStyle(probe).color;
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
