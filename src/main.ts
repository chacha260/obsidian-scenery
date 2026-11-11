import { FuzzySuggestModal, Plugin, TFile } from "obsidian";
import { t } from "./i18n";
import { Renderer } from "./renderer";
import { ScenerySettingTab } from "./settings";
import { DEFAULT_SETTINGS, detectType, ScenerySettings, WallpaperItem } from "./types";

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
  private renderer!: Renderer;
  private userPaused = false;
  private slideshowTimer: number | null = null;

  async onload() {
    await this.loadSettings();
    this.renderer = new Renderer(this.app, () => this.settings);
    this.addSettingTab(new ScenerySettingTab(this.app, this));

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
    this.registerEvent(this.app.workspace.on("css-change", () => this.renderer.themeChanged()));

    this.registerDomEvent(window, "blur", () => this.updatePaused());
    this.registerDomEvent(window, "focus", () => this.updatePaused());
    this.registerDomEvent(document, "visibilitychange", () => this.updatePaused());
    this.registerDomEvent(document, "mousemove", (e) => {
      if (this.settings.parallax > 0) {
        this.renderer.setPointer(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
      }
    });

    this.app.workspace.onLayoutReady(() => this.refresh());
  }

  onunload() {
    this.renderer.unmount();
    document.body.style.removeProperty("--scenery-panel");
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<ScenerySettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.settings.items = (data?.items ?? DEFAULT_SETTINGS.items).map((i) => ({ ...i }));
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
      this.renderer.mount();
      this.renderer.applyStyle();
      this.updatePaused();
      this.renderer.show(this.activeItem);
    } else {
      this.renderer.unmount();
    }
    this.restartSlideshow();
  }

  applyStyle() {
    this.renderer.applyStyle();
  }

  private updatePaused() {
    const background = document.hidden || !document.hasFocus();
    this.renderer.setPaused(this.userPaused || (this.settings.pauseOnBlur && background));
  }

  private restartSlideshow() {
    if (this.slideshowTimer !== null) window.clearInterval(this.slideshowTimer);
    this.slideshowTimer = null;
    const s = this.settings;
    if (!s.enabled || !s.slideshow || s.items.length < 2) return;
    const ms = Math.max(0.1, s.intervalMinutes) * 60_000;
    this.slideshowTimer = window.setInterval(() => {
      // Don't burn through the playlist while nobody is looking.
      if (document.hidden) return;
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
      if (!kind) continue;
      const existing = this.settings.items.find((i) => i.source === source && i.type === kind);
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const fallback = decodeURIComponent(source.split(/[?#]/)[0].split(/[\\/]/).filter(Boolean).pop() ?? source);
      this.settings.items.push({ id, name: name || fallback, type: kind, source });
      ids.push(id);
    }
    return ids;
  }
}
