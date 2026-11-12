import { FuzzySuggestModal, Notice, Plugin, TFile, debounce, normalizePath } from "obsidian";
import { EDITOR_VIEW, SceneEditorView } from "./editor";
import { t } from "./i18n";
import { loadManifest, MANIFEST_FILE, NoteInfo, PackageManifest } from "./package";
import { ensureFolder, exportScene, safeName } from "./sceneio";
import { NameModal } from "./pickers";
import { Renderer } from "./renderer";
import { TEMPLATE_HTML, templateManifest } from "./template";
import { ScenerySettingTab } from "./settings";
import { DEFAULT_SETTINGS, detectType, newLayer, ScenerySettings, uid, WallpaperItem } from "./types";

class WallpaperPicker extends FuzzySuggestModal<WallpaperItem> {
  constructor(private plugin: SceneryPlugin) {
    super(plugin.app);
    this.setPlaceholder(t("cmd.pick"));
  }
  getItems() {
    return this.plugin.settings.items;
  }
  getItemText(item: WallpaperItem) {
    return `${item.name} (${t(`type.${item.type}`)})`;
  }
  onChooseItem(item: WallpaperItem) {
    void this.plugin.setActive(item.id);
  }
}

export default class SceneryPlugin extends Plugin {
  settings: ScenerySettings = DEFAULT_SETTINGS;
  /** One renderer per window showing the wallpaper. */
  private renderers = new Map<Window, Renderer>();
  private userPaused = false;
  private slideshowTimer: number | null = null;
  /** Scene currently open in the editor panel. */
  editingId: string | null = null;
  private saveSoon = debounce(() => void this.saveSettings(), 500, true);

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ScenerySettingTab(this.app, this));
    this.registerView(EDITOR_VIEW, (leaf) => new SceneEditorView(leaf, this));
    this.addCommand({ id: "new-scene", name: t("cmd.newScene"), callback: () => void this.createScene() });
    this.addCommand({
      id: "edit-scene",
      name: t("cmd.editScene"),
      callback: () => {
        const active = this.activeItem;
        const scene = active?.type === "scene" ? active : this.settings.items.find((i) => i.type === "scene");
        void (scene ? this.openEditor(scene.id) : this.createScene());
      },
    });

    this.addRibbonIcon("image", t("cmd.pick"), () => new WallpaperPicker(this).open());
    this.addCommand({ id: "toggle", name: t("cmd.toggle"), callback: () => this.toggle() });
    this.addCommand({ id: "next", name: t("cmd.next"), callback: () => this.step(1) });
    this.addCommand({ id: "previous", name: t("cmd.prev"), callback: () => this.step(-1) });
    this.addCommand({ id: "random", name: t("cmd.random"), callback: () => this.random() });
    this.addCommand({ id: "pick", name: t("cmd.pick"), callback: () => new WallpaperPicker(this).open() });
    this.addCommand({
      id: "pause",
      name: t("cmd.pause"),
      callback: () => {
        this.userPaused = !this.userPaused;
        this.updatePaused();
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || !detectType(file.path)) return;
        menu.addItem((item) =>
          item
            .setTitle(t("menu.set"))
            .setIcon("image")
            .onClick(() => void this.setActive(this.addItems([file.path])[0]))
        );
      })
    );
    this.registerEvent(this.app.workspace.on("css-change", () => this.all((r) => r.themeChanged())));
    this.registerEvent(this.app.workspace.on("file-open", () => this.all((r) => r.noteChanged())));

    this.addCommand({
      id: "new-package",
      name: t("cmd.newPackage"),
      callback: () => new NameModal(this.app, t("cmd.newPackage"), "", t("pkg.create"), (name) => void this.createPackage(name)).open(),
    });
    this.addCommand({ id: "reload", name: t("cmd.reload"), callback: () => this.reloadWallpaper() });
    this.addCommand({
      id: "export-scene",
      name: t("cmd.exportScene"),
      checkCallback: (checking) => {
        const active = this.activeItem;
        if (active?.type !== "scene") return false;
        if (!checking) void this.exportScene(active.id);
        return true;
      },
    });
    // Authoring loop: saving a file of the active package reloads the wallpaper.
    const reloadSoon = debounce(() => this.reloadWallpaper(), 400, true);
    const onFileChange = (file: { path: string }) => {
      const active = this.activeItem;
      if (!this.settings.enabled || !active) return;
      const folders =
        active.type === "package"
          ? [active.source]
          : (active.scene ?? []).filter((l) => l.kind === "package" && l.source).map((l) => l.source);
      if (folders.some((folder) => file.path.startsWith(`${folder}/`))) reloadSoon();
    };
    this.registerEvent(this.app.vault.on("modify", onFileChange));
    this.registerEvent(this.app.vault.on("create", onFileChange));
    this.registerEvent(this.app.vault.on("delete", onFileChange));

    this.attachWindow(window);
    this.registerEvent(
      this.app.workspace.on("window-open", (_workspaceWindow, win) => {
        if (!this.settings.popouts) return;
        this.attachWindow(win);
        this.refresh();
      })
    );
    this.registerEvent(this.app.workspace.on("window-close", (_workspaceWindow, win) => this.detachWindow(win)));

    this.app.workspace.onLayoutReady(() => {
      this.syncWindows();
      this.refresh();
    });
  }

  onunload() {
    this.all((r) => r.unmount());
    this.renderers.clear();
  }

  private all(fn: (renderer: Renderer) => void) {
    this.renderers.forEach(fn);
  }

  private attachWindow(win: Window) {
    if (this.renderers.has(win)) return;
    const renderer = new Renderer(this.app, win, () => this.settings, () => this.noteInfo());
    renderer.setPreview(this.preview);
    this.renderers.set(win, renderer);
    this.registerDomEvent(win, "blur", () => this.updatePaused());
    this.registerDomEvent(win, "focus", () => this.updatePaused());
    this.registerDomEvent(win.document, "visibilitychange", () => this.updatePaused());
    this.registerDomEvent(win.document, "mousemove", (e) => {
      renderer.setPointer(e.clientX / win.innerWidth, e.clientY / win.innerHeight);
    });
  }

  private detachWindow(win: Window) {
    const renderer = this.renderers.get(win);
    if (!renderer || win === window) return;
    this.renderers.delete(win);
    try {
      renderer.unmount();
    } catch {
      // The window is already gone; nothing left to clean up.
    }
  }

  /** Attach to pop-out windows that are already open, or let go of them when the setting is off. */
  syncWindows() {
    if (!this.settings.popouts) {
      for (const win of [...this.renderers.keys()]) this.detachWindow(win);
      return;
    }
    this.app.workspace.iterateAllLeaves((leaf) => {
      const win = leaf.view.containerEl.ownerDocument.defaultView;
      if (win) this.attachWindow(win);
    });
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<ScenerySettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.settings.items = (data?.items ?? DEFAULT_SETTINGS.items).map((i) => ({
      ...i,
      // Fill in fields that older versions did not save.
      ...(i.scene ? { scene: i.scene.map((l) => ({ ...newLayer(l.kind, l.name), ...l })) } : {}),
    }));
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  get activeItem(): WallpaperItem | null {
    return this.settings.items.find((i) => i.id === this.settings.activeId) ?? null;
  }

  /** Bring the DOM in line with the settings. */
  refresh() {
    if (this.settings.enabled) {
      this.all((r) => r.mount());
      this.all((r) => r.applyStyle());
      this.updatePaused();
      this.all((r) => r.show(this.activeItem));
    } else {
      this.all((r) => r.unmount());
    }
    this.restartSlideshow();
  }

  private noteInfo(): NoteInfo | null {
    const file = this.app.workspace.getActiveFile();
    return file ? { name: file.basename, path: file.path } : null;
  }

  reloadWallpaper() {
    if (this.settings.enabled) this.all((r) => r.reload(this.activeItem));
  }

  /** Called by the settings tab after the user changed a package's values. */
  packageChanged(item: WallpaperItem, manifest: PackageManifest) {
    this.all((r) => r.updatePackage(item, manifest));
    this.saveSoon();
  }

  /** Create a working example package in the vault and show it. Returns its folder, or null. */
  async createPackage(name: string): Promise<string | null> {
    const { vault } = this.app;
    const safe = safeName(name);
    if (!safe) return null;
    const folder = normalizePath(`${this.settings.packageFolder || "Scenery"}/${safe}`);
    if (await vault.adapter.exists(folder)) {
      new Notice(t("pkg.exists", { path: folder }));
      return null;
    }
    await ensureFolder(this.app, folder);
    await vault.create(`${folder}/${MANIFEST_FILE}`, JSON.stringify(templateManifest(name), null, 2) + "\n");
    await vault.create(`${folder}/index.html`, TEMPLATE_HTML);
    await this.setActive(this.addItems([folder], "package", name)[0]);
    new Notice(t("pkg.created", { path: folder }));
    return folder;
  }

  /** Write a scene to a folder in the vault so it can be backed up or shared. */
  async exportScene(id: string): Promise<string | null> {
    const item = this.settings.items.find((i) => i.id === id && i.type === "scene");
    const safe = item && safeName(item.name);
    if (!item || !safe) return null;
    const folder = normalizePath(`${this.settings.packageFolder || "Scenery"}/${safe}`);
    try {
      // Re-exporting over an earlier export is fine; overwriting anything else is not.
      if (await this.app.vault.adapter.exists(folder)) {
        const existing = await loadManifest(this.app, folder).catch(() => null);
        if (existing?.type !== "scene") {
          new Notice(t("pkg.exists", { path: folder }));
          return null;
        }
      }
      await exportScene(this.app, item, folder);
    } catch (e) {
      console.error("Scenery: export failed", e);
      new Notice(`${t("scene.exportFailed")} ${String(e)}`);
      return null;
    }
    new Notice(t("scene.exported", { path: folder }));
    return folder;
  }

  /** Called by the editor after it mutated a scene in place. */
  sceneChanged() {
    if (this.settings.enabled) this.all((r) => r.show(this.activeItem));
    this.saveSoon();
  }

  async createScene() {
    const count = this.settings.items.filter((i) => i.type === "scene").length;
    const item: WallpaperItem = {
      id: uid(),
      name: `${t("type.scene")} ${count + 1}`,
      type: "scene",
      source: "",
      scene: [
        newLayer("color", t("kind.color")),
        newLayer("effect", "Aurora", { source: "aurora", opacity: 70 }),
        newLayer("effect", "Fireflies", { source: "fireflies", themeColor: false, depth: 100 }),
      ],
    };
    this.settings.items.push(item);
    await this.openEditor(item.id);
  }

  /** Show the scene as the wallpaper and open the editor panel on it. */
  async openEditor(id: string) {
    this.editingId = id;
    await this.setActive(id);
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(EDITOR_VIEW)[0];
    if (!leaf) {
      const fresh = workspace.getRightLeaf(false);
      if (!fresh) return;
      leaf = fresh;
      await leaf.setViewState({ type: EDITOR_VIEW, active: true });
    }
    void workspace.revealLeaf(leaf);
    if (leaf.view instanceof SceneEditorView) leaf.view.render();
  }

  applyStyle() {
    this.all((r) => r.applyStyle());
  }

  private updatePaused() {
    // "In the background" means no Obsidian window is both visible and focused.
    const background = [...this.renderers.keys()].every((win) => win.document.hidden || !win.document.hasFocus());
    this.setPaused(this.userPaused || (this.settings.pauseOnBlur && background));
  }

  /** Whether the editor's "preview without dimming" is on. Not saved. */
  preview = false;

  setPreview(preview: boolean) {
    this.preview = preview;
    this.all((r) => r.setPreview(preview));
  }

  setPaused(paused: boolean) {
    this.all((r) => r.setPaused(paused));
  }

  private restartSlideshow() {
    if (this.slideshowTimer !== null) window.clearInterval(this.slideshowTimer);
    this.slideshowTimer = null;
    const s = this.settings;
    if (!s.enabled || !s.slideshow || s.items.length < 2) return;
    const ms = Math.max(0.1, s.intervalMinutes) * 60_000;
    this.slideshowTimer = window.setInterval(() => {
      // Don't burn through the playlist while nobody is looking.
      if ([...this.renderers.keys()].every((win) => win.document.hidden)) return;
      void (s.shuffle ? this.random() : this.step(1));
    }, ms);
    this.registerInterval(this.slideshowTimer);
  }

  async toggle() {
    this.settings.enabled = !this.settings.enabled;
    await this.saveSettings();
    this.refresh();
  }

  async setActive(id: string | null) {
    this.settings.activeId = id;
    this.settings.enabled = true;
    await this.saveSettings();
    this.refresh();
  }

  async step(delta: number) {
    const items = this.settings.items;
    if (!items.length) return;
    const index = items.findIndex((i) => i.id === this.settings.activeId);
    await this.setActive(items[(index + delta + items.length) % items.length].id);
  }

  async random() {
    const others = this.settings.items.filter((i) => i.id !== this.settings.activeId);
    if (others.length) await this.setActive(others[Math.floor(Math.random() * others.length)].id);
  }

  /** Add sources to the library (skipping duplicates) and return the ids, existing or new. */
  addItems(sources: string[], type?: WallpaperItem["type"], name?: string): string[] {
    const ids: string[] = [];
    for (const source of sources) {
      const kind = type ?? detectType(source);
      if (!kind || kind === "scene") continue;
      const existing = this.settings.items.find((i) => i.source === source && i.type === kind);
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const id = uid();
      const fallback = decodeURIComponent(source.split(/[?#]/)[0].split(/[\\/]/).filter(Boolean).pop() ?? source);
      this.settings.items.push({ id, name: name || fallback, type: kind, source });
      ids.push(id);
    }
    return ids;
  }
}
