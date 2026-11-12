// Boots the plugin against an in-memory vault. Paths under "media/" and "ext/" are
// served from test/fixtures; everything else lives in `mem`.
import SceneryPlugin from "../../src/main.ts";
import { importScene } from "../../src/sceneio.ts";
import { loadManifest } from "../../src/package.ts";
import { TFile, patchWindow } from "obsidian";

const served = ["media/photo.png", "media/clip.webm"];
const mem = (window.__mem = new Map());
const alias = (window.__alias = new Map());
const dirs = new Set();
const vaultOn = (window.__vaultOn = {});
const workspaceOn = (window.__workspaceOn = {});
let view = null;

const leaf = {
  get view() { return view; },
  async setViewState() {
    view = window.__viewFactory(leaf);
    document.querySelector("#panel").replaceChildren(view.contentEl);
    await view.onOpen();
  },
};
const fetchOk = async (p) => (await fetch("/fixtures/" + p)).ok;
const adapter = {
  async read(p) { if (mem.has(p)) return mem.get(p); const r = await fetch("/fixtures/" + p); if (!r.ok) throw new Error("ENOENT " + p); return r.text(); },
  async exists(p) { return mem.has(p) || alias.has(p) || dirs.has(p) || [...mem.keys()].some((k) => k.startsWith(p + "/")) || fetchOk(p); },
  async write(p, d) { mem.set(p, d); },
  async remove(p) { mem.delete(p); alias.delete(p); },
  async copy(a, b) { if (mem.has(a)) mem.set(b, mem.get(a)); else alias.set(b, alias.get(a) || a); },
  async list(dir) {
    const files = new Set(), folders = new Set();
    for (const k of mem.keys()) {
      if (!k.startsWith(dir + "/")) continue;
      const rest = k.slice(dir.length + 1).split("/");
      (rest.length === 1 ? files : folders).add(dir + "/" + rest[0]);
    }
    return { files: [...files], folders: [...folders] };
  },
  getResourcePath: (p) => `${location.origin}/fixtures/${alias.get(p) || p}?123`,
};
const app = (window.__app = {
  vault: {
    adapter,
    getAbstractFileByPath: (p) => (served.includes(p) || alias.has(p) ? new TFile(p) : null),
    getResourcePath: (f) => `/fixtures/${alias.get(f.path) || f.path}`,
    getFiles: () => served.map((p) => new TFile(p)),
    async createFolder(p) { dirs.add(p); },
    async create(p, d) { mem.set(p, d); },
    on(event, fn) { (vaultOn[event] ||= []).push(fn); },
  },
  workspace: {
    on(event, fn) { (workspaceOn[event] ||= []).push(fn); },
    onLayoutReady: (fn) => fn(),
    iterateAllLeaves() {},
    getLeavesOfType: () => (view ? [leaf] : []),
    getRightLeaf: () => leaf,
    revealLeaf() { if (view) document.querySelector("#panel").replaceChildren(view.contentEl); },
    getActiveFile: () => ({ basename: "Welcome", path: "notes/Welcome.md" }),
  },
});

window.patchWindow = patchWindow;
window.importSceneFrom = async (folder) => importScene(await loadManifest(app, folder), folder);
window.plugin = new SceneryPlugin(app);
window.ready = window.plugin.onload();
