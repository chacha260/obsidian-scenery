import "./obsidian-shim";
import { t } from "../src/i18n";
import type { PackageManifest } from "../src/package";
import { safeName } from "../src/sceneio";
import * as form from "./form";
import { canSaveToFolder, chooseFolder, download, openFolder, writeFolder } from "./io";
import { PackageMode } from "./package-mode";
import { SceneMode } from "./scene-mode";
import { Stage } from "./stage";
import { MemoryVault } from "./vault";
import { zip } from "./zip";

activeDocument.documentElement.lang = navigator.language?.startsWith("ja") ? "ja" : "en";

const THEMES = {
  dark: { "--background-primary": "#1e1e1e", "--background-secondary": "#262626", "--text-normal": "#dadada", "--text-muted": "#9a9a9a", "--line": "#3a3a3a" },
  light: { "--background-primary": "#ffffff", "--background-secondary": "#f4f4f4", "--text-normal": "#222222", "--text-muted": "#6c6c6c", "--line": "#dcdcdc" },
};

const app = activeDocument.querySelector<HTMLElement>("#app") as HTMLElement;
const bar = app.createDiv({ cls: "bar" });
const work = app.createDiv({ cls: "work" });
const stageWrap = work.createDiv({ cls: "stage-wrap" });
const stage = new Stage(stageWrap);
const panel = work.createDiv({ cls: "panel" });

const vault = new MemoryVault();
let dirty = false;
const markDirty = () => (dirty = true);
const modes = {
  scene: new SceneMode(vault, stage, panel, markDirty),
  package: new PackageMode(vault, stage, panel, markDirty),
};
type ModeName = keyof typeof modes;
let current: ModeName = "scene";
let paused = false;

function applyTheme(dark: boolean, accent: string) {
  activeDocument.body.classList.toggle("theme-dark", dark);
  activeDocument.body.classList.toggle("theme-light", !dark);
  for (const [name, value] of Object.entries(THEMES[dark ? "dark" : "light"])) activeDocument.body.style.setProperty(name, value);
  activeDocument.body.style.setProperty("--interactive-accent", accent);
  modes[current].themeChanged();
}

function switchTo(name: ModeName) {
  modes[current].deactivate();
  current = name;
  activeDocument.body.dataset.mode = name;
  for (const [key, tab] of Object.entries(modeTabs)) tab.toggleClass("is-active", key === name);
  modes[name].setPaused(paused);
  modes[name].activate();
}

// ---- top bar ----
bar.createDiv({ cls: "brand", text: "Scenery Studio" });
const tabs = bar.createDiv({ cls: "tabs" });
const modeTabs = {
  scene: form.button(tabs, t("studio.scene"), () => switchTo("scene")),
  package: form.button(tabs, t("studio.package"), () => switchTo("package")),
};

const view = bar.createDiv({ cls: "view" });
let dark = true;
let accent = "#8a5cf5";
form.toggle(view, t("studio.dark"), dark, (v) => applyTheme((dark = v), accent));
form.color(view, t("studio.accent"), accent, (v) => applyTheme(dark, (accent = v)));
form.toggle(view, t("studio.mock"), true, (v) => stage.setMock(v));
form.slider(view, t("set.dim"), 55, [0, 100, 1], (v) => stage.setDim(v));
form.slider(view, t("studio.parallax"), 0, [0, 40, 1], (v) => stage.setParallax(v));
form.toggle(view, t("studio.pause"), false, (v) => {
  paused = v;
  stage.setPaused(v);
  modes[current].setPaused(v);
});

const files = bar.createDiv({ cls: "files" });
type Folder = NonNullable<Awaited<ReturnType<typeof chooseFolder>>>;
let folder: Folder | null = null;

async function save(pick: boolean) {
  if (!canSaveToFolder()) return form.toast(t("studio.noFolderApi"));
  if (pick || !folder) {
    form.toast(t("studio.saveHint"));
    const chosen = await chooseFolder();
    if (!chosen) return;
    folder = chosen;
    saveButton.hidden = false;
  }
  try {
    const path = await writeFolder(folder, safeName(modes[current].name) || "wallpaper", modes[current].files());
    dirty = false;
    form.toast(t("studio.saved", { path }));
  } catch (e) {
    form.toast(String(e));
  }
}

async function openProject() {
  const picked = await openFolder();
  if (!picked) return;
  const manifestFile = picked.files.get("scenery.json");
  if (!manifestFile) return form.toast(t("studio.notScenery"));
  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(await manifestFile.text()) as PackageManifest;
  } catch (e) {
    return form.toast(`${t("studio.badJson")} ${String(e)}`);
  }
  const target: ModeName = manifest.type === "scene" ? "scene" : "package";
  modes[current].deactivate();
  await modes[target].load(manifest, picked.files);
  current = target;
  switchTo(target);
  dirty = false;
  form.toast(t("studio.opened", { name: manifest.name || picked.name }));
}

form.button(files, t("studio.open"), () => void openProject());
form.button(files, t("studio.saveFolder"), () => void save(true));
const saveButton = form.button(files, t("studio.save"), () => void save(false), "primary");
saveButton.hidden = true;
async function downloadZip() {
  const name = safeName(modes[current].name) || "wallpaper";
  // The folder goes inside the archive so that unpacking gives one folder to drop into the vault.
  const entries = new Map([...modes[current].files()].map(([path, blob]) => [`${name}/${path}`, blob]));
  download(`${name}.zip`, await zip(entries));
  dirty = false;
}

form.button(files, t("studio.zip"), () => void downloadZip());

// ---- page-wide behaviour ----
activeDocument.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    void save(false);
  }
});
activeDocument.addEventListener("dragover", (e) => e.preventDefault());
activeDocument.addEventListener("drop", (e) => {
  e.preventDefault();
  const dropped = Array.from(e.dataTransfer?.files ?? []);
  if (!dropped.length) return;
  if (current !== "scene") switchTo("scene");
  modes.scene.addFiles(dropped);
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) e.preventDefault();
});

// Exposed for the automated checks in test/studio.mjs.
Object.assign(window, { studio: { modes, vault, switchTo, zip } });

applyTheme(dark, accent);
switchTo("scene");
