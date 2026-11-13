import {
  App,
  ExtraButtonComponent,
  Menu,
  Modal,
  Notice,
  Platform,
  PluginSettingTab,
  Setting,
  SettingDefinition,
  SettingDefinitionItem,
  setIcon,
  TFolder,
} from "obsidian";
import { moveItem } from "./dnd";
import { EffectPlayer } from "./effects";
import { hasManifest, loadManifest, PackageManifest, resolveValues, selectOptions } from "./package";
import { importScene } from "./sceneio";
import { t } from "./i18n";
import type SceneryPlugin from "./main";
import { FilePicker, FolderPicker, NameModal } from "./pickers";
import { SceneRuntime } from "./scene";
import { resolveSource } from "./source";
import { DEFAULT_SETTINGS, detectType, EFFECT_IDS, Look, pickLook, ScenerySettings, uid, WallpaperItem, WallpaperType } from "./types";

class UrlModal extends Modal {
  private source = "";
  private name = "";
  private type: WallpaperType | "auto" = "auto";

  constructor(app: App, private onSubmit: (source: string, type: WallpaperType, name: string) => void) {
    super(app);
  }

  onOpen() {
    this.setTitle(t("modal.url.title"));
    new Setting(this.contentEl).setName(t("modal.url.source")).addText((text) => {
      text.setPlaceholder("https://… / C:\\wallpapers\\a.mp4").onChange((v) => (this.source = v.trim()));
      text.inputEl.addClass("scenery-wide-input");
    });
    new Setting(this.contentEl).setName(t("modal.url.name")).addText((text) => text.onChange((v) => (this.name = v.trim())));
    new Setting(this.contentEl).setName(t("modal.url.type")).addDropdown((d) =>
      d
        .addOptions({
          auto: t("modal.url.auto"),
          image: t("type.image"),
          video: t("type.video"),
          web: t("type.web"),
        })
        .onChange((v) => (this.type = v as WallpaperType | "auto"))
    );
    new Setting(this.contentEl).addButton((b) =>
      b
        .setButtonText(t("modal.url.add"))
        .setCta()
        .onClick(() => {
          if (!this.source) return;
          const type = this.type === "auto" ? detectType(this.source) : this.type;
          if (!type) {
            new Notice(t("notice.unknownType"));
            return;
          }
          this.onSubmit(this.source, type, this.name);
          this.close();
        })
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Settings whose change needs more than new CSS values: timers, windows, what is shown. */
const NEEDS_REFRESH = new Set(["enabled", "pauseOnBlur", "popouts", "slideshow", "intervalMinutes", "shuffle"]);

// Control keys are namespaced so one tab can edit several stores.
const LOOK = "look.";
const PACKAGE = "pkg.";
const THEME = "theme.";
const OWN_LOOK = "own-look";
const ALLOW_NOTE = "allow-note";

/**
 * The settings tab, described declaratively so every setting shows up in Obsidian's
 * settings search. The library is a list whose rows are drawn by hand (thumbnail,
 * buttons); the rest is plain controls on sub-pages, which keeps the first screen short. Appearance controls edit either the
 * shared look or the current wallpaper's own, and a package's declared properties
 * are turned into controls of their own.
 */
export class ScenerySettingTab extends PluginSettingTab {
  /** Manifests of packages shown here, or the error from reading one. Loaded on demand. */
  private manifests = new Map<string, PackageManifest | Error>();
  private loading = new Set<string>();

  constructor(app: App, private plugin: SceneryPlugin) {
    super(app, plugin);
  }

  // ---- redrawing ----

  /** The element that scrolls the settings, if it is scrolled at all. */
  private scroller(): HTMLElement | null {
    for (let el: HTMLElement | null = this.containerEl; el; el = el.parentElement) {
      if (el.scrollTop > 0) return el;
    }
    return null;
  }

  /** Rebuild the tab from fresh definitions without throwing the view back to the top. */
  redraw() {
    // Hidden tabs are rebuilt by Obsidian when they are opened.
    if (!this.containerEl.isConnected) return;
    const scroller = this.scroller();
    const top = scroller?.scrollTop ?? 0;
    this.update();
    if (scroller) scroller.scrollTop = top;
  }

  /** Package files changed on disk: what we remember about them is stale. */
  forgetManifests() {
    this.manifests.clear();
    this.redraw();
  }

  private async save(full = false) {
    await this.plugin.saveSettings();
    if (full) this.plugin.refresh();
    else this.plugin.applyStyle();
  }

  private closeSettings() {
    // No public API closes the settings window; this one is long-standing and widely used.
    (this.app as unknown as { setting?: { close?: () => void } }).setting?.close?.();
  }

  // ---- definitions ----

  getSettingDefinitions(): SettingDefinitionItem[] {
    const { plugin } = this;
    const s = plugin.settings;
    const active = plugin.activeItem;

    const slider = (key: string, name: string, range: [number, number, number], desc?: string): SettingDefinition => ({
      name,
      desc,
      control: { type: "slider", key, min: range[0], max: range[1], step: range[2] },
    });
    const toggle = (key: string, name: string, desc?: string): SettingDefinition => ({ name, desc, control: { type: "toggle", key } });

    const wallpapers: Record<string, string> = { "": t("set.theme.none") };
    for (const item of s.items) wallpapers[item.id] = item.name;

    return [
      toggle("enabled", t("set.enabled"), t("set.enabled.desc")),
      {
        type: "list",
        heading: t("set.library"),
        cls: "scenery-library",
        emptyState: t("set.library.empty"),
        search: {
          placeholder: t("set.filter.placeholder"),
          match: (def, query) => {
            const needle = query.trim().toLowerCase();
            const haystack = [def.name, typeof def.desc === "string" ? def.desc : "", ...(def.aliases ?? [])];
            return haystack.some((text) => text.toLowerCase().includes(needle));
          },
        },
        items: s.items.map((item) => this.libraryRow(item)),
        onDelete: (index) => {
          const item = s.items[index];
          // The notice it shows can bring the wallpaper back; redraw then too.
          if (item) void plugin.removeItem(item.id, () => this.redraw()).then(() => this.redraw());
        },
        onReorder: (from, to) => {
          moveItem(s.items, from, to);
          void this.save(true).then(() => this.redraw());
        },
        addItem: { name: t("set.add"), action: (el) => this.showAddMenu(el) },
      },
      ...(active?.type === "package" ? this.packageGroup(active) : []),
      {
        type: "page",
        name: t("set.appearance"),
        desc: t("set.appearance.desc"),
        displayValue: () => (plugin.activeItem?.look ? t("set.hasLook") : t("set.shared")),
        items: [
          { ...toggle(OWN_LOOK, t("set.ownLook"), t("set.ownLook.desc")), visible: () => !!plugin.activeItem },
          {
            name: t("set.fit"),
            desc: t("set.fit.desc"),
            control: {
              type: "dropdown",
              key: `${LOOK}fit`,
              options: { cover: t("set.fit.cover"), contain: t("set.fit.contain"), fill: t("set.fit.fill") },
            },
          },
          slider(`${LOOK}dim`, t("set.dim"), [0, 100, 1], t("set.dim.desc")),
          slider(`${LOOK}panelTint`, t("set.panelTint"), [0, 100, 1], t("set.panelTint.desc")),
          slider(`${LOOK}blur`, t("set.blur"), [0, 40, 1]),
          slider(`${LOOK}brightness`, t("set.brightness"), [20, 150, 1]),
          slider(`${LOOK}saturation`, t("set.saturation"), [0, 200, 1]),
          slider(`${LOOK}parallax`, t("set.parallax"), [0, 40, 1], t("set.parallax.desc")),
          {
            name: t("pkg.reset"),
            desc: t("set.appearance.reset.desc"),
            action: () => {
              // A wallpaper's own look goes back to the shared one; the shared one to the defaults.
              const current = plugin.activeItem;
              if (current?.look) current.look = pickLook(s);
              else Object.assign(s, pickLook(DEFAULT_SETTINGS));
              void this.save().then(() => this.redraw());
            },
          },
        ],
      },
      {
        type: "page",
        name: t("set.playback"),
        desc: t("set.playback.desc"),
        items: [
          slider("volume", t("set.volume"), [0, 100, 1], t("set.volume.desc")),
          slider("playbackRate", t("set.rate"), [0.25, 2, 0.05]),
          slider("fps", t("set.fps"), [10, 60, 5], t("set.fps.desc")),
          toggle("pauseOnBlur", t("set.pauseOnBlur"), t("set.pauseOnBlur.desc")),
          toggle("popouts", t("set.popouts"), t("set.popouts.desc")),
        ],
      },
      {
        type: "page",
        name: t("set.switching"),
        desc: t("set.switching.desc"),
        displayValue: () => (s.slideshow ? t("set.switching.on", { n: s.intervalMinutes }) : ""),
        items: [
          {
            type: "group",
            heading: t("set.slideshow"),
            items: [
              toggle("slideshow", t("set.slideshow.enable")),
              { ...slider("intervalMinutes", t("set.interval"), [1, 120, 1]), visible: () => s.slideshow },
              { ...toggle("shuffle", t("set.shuffle")), visible: () => s.slideshow },
            ],
          },
          {
            type: "group",
            heading: t("set.theme"),
            items: (["light", "dark"] as const).map(
              (mode): SettingDefinition => ({
                name: t(`set.theme.${mode}`),
                desc: t("set.theme.desc"),
                control: { type: "dropdown", key: `${THEME}${mode}`, options: wallpapers },
              })
            ),
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    const s = this.plugin.settings;
    const active = this.plugin.activeItem;
    if (key === OWN_LOOK) return !!active?.look;
    if (key === ALLOW_NOTE) return !!active?.allowNote;
    if (key.startsWith(LOOK)) return (active?.look ?? s)[key.slice(LOOK.length) as keyof Look];
    if (key.startsWith(THEME)) {
      const id = s.themeWallpapers[key.slice(THEME.length) as "light" | "dark"];
      return s.items.some((i) => i.id === id) ? id : "";
    }
    if (key.startsWith(PACKAGE)) {
      const manifest = active && this.manifests.get(active.id);
      return manifest && !(manifest instanceof Error) ? resolveValues(manifest, active.values)[key.slice(PACKAGE.length)] : undefined;
    }
    return s[key as keyof ScenerySettings];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const { plugin } = this;
    const s = plugin.settings;
    const active = plugin.activeItem;

    if (key === OWN_LOOK) {
      if (!active) return;
      // Start from what is on screen now, so switching it on changes nothing visible.
      if (value) active.look = pickLook(s);
      else delete active.look;
      await this.save();
      this.redraw();
    } else if (key.startsWith(LOOK)) {
      const target = (active?.look ?? s) as unknown as Record<string, unknown>;
      target[key.slice(LOOK.length)] = value;
      await this.save();
    } else if (key.startsWith(THEME)) {
      s.themeWallpapers[key.slice(THEME.length) as "light" | "dark"] = String(value);
      await plugin.saveSettings();
      const before = s.activeId;
      plugin.applyThemeWallpaper();
      // Only rebuild when the wallpaper actually changed: a rebuild may leave the page being edited.
      if (s.activeId !== before) this.redraw();
    } else if (key === ALLOW_NOTE || key.startsWith(PACKAGE)) {
      const manifest = active && this.manifests.get(active.id);
      if (!active || !manifest || manifest instanceof Error) return;
      if (key === ALLOW_NOTE) active.allowNote = !!value;
      else (active.values ??= {})[key.slice(PACKAGE.length)] = value;
      plugin.packageChanged(active, manifest);
    } else {
      (s as unknown as Record<string, unknown>)[key] = value;
      if (key === "popouts") plugin.syncWindows();
      await this.save(NEEDS_REFRESH.has(key));
      this.refreshDomState();
    }
  }

  // ---- library ----

  private libraryRow(item: WallpaperItem): SettingDefinition {
    const { plugin } = this;
    const desc =
      (item.type === "scene"
        ? `${t("type.scene")} · ${t("set.layerCount", { n: item.scene?.length ?? 0 })}`
        : `${t(`type.${item.type}`)} · ${item.source}`) +
      (item.folder ? ` · ${item.folder}` : "") +
      (item.look ? ` · ${t("set.hasLook")}` : "");
    return {
      name: item.name,
      desc,
      render: (setting) => {
        const active = item.id === plugin.settings.activeId;
        setting.setName(item.name).setDesc(desc);
        setting.settingEl.addClass("scenery-item");
        setting.settingEl.toggleClass("is-active", active);
        const release = this.thumbnail(setting, item);
        if (item.type === "scene") {
          setting.addExtraButton((b) =>
            b
              .setIcon("layers")
              .setTooltip(t("cmd.editScene"))
              .onClick(() => {
                this.closeSettings();
                void plugin.openEditor(item.id);
              })
          );
        }
        setting.addExtraButton((b) =>
          b
            .setIcon("pencil")
            .setTooltip(t("set.rename"))
            .onClick(() => {
              new NameModal(this.app, t("set.rename"), item.name, t("set.rename"), (name) => {
                item.name = name;
                void this.save(true).then(() => this.redraw());
              }).open();
            })
        );
        setting.addButton((b) => {
          b.setButtonText(active ? t("set.active") : t("set.use")).setDisabled(active);
          if (active) b.setCta();
          b.onClick(() => void plugin.setActive(item.id).then(() => this.redraw()));
        });
        return release;
      },
    };
  }

  /** A small still preview at the start of a library row. Returns what releases it. */
  private thumbnail(row: Setting, item: WallpaperItem): () => void {
    // Obsidian redraws into the row it already has, so a preview from last time may still be here.
    row.settingEl.querySelectorAll(":scope > .scenery-thumb").forEach((old) => old.remove());
    const el = row.settingEl.createDiv({ cls: "scenery-thumb" });
    row.settingEl.prepend(el);
    let release = () => undefined as void;
    if (item.type === "image") {
      const img = el.createEl("img", { cls: "scenery-media" });
      img.loading = "lazy";
      img.src = resolveSource(this.app, item.source);
    } else if (item.type === "video") {
      const video = el.createEl("video", { cls: "scenery-media" });
      video.muted = true;
      video.preload = "metadata";
      // A media fragment makes the browser show a frame from inside the clip, not a black first frame.
      video.src = `${resolveSource(this.app, item.source)}#t=0.5`;
    } else if (item.type === "effect") {
      // Never started: the player draws one frame and stays still.
      const player = new EffectPlayer(el, item.source);
      release = () => player.destroy();
    } else if (item.type === "scene") {
      const scene = new SceneRuntime(this.app, el, () => this.plugin.settings);
      scene.setPaused(true);
      // Package layers would each start a live page; leave them out of a thumbnail.
      scene.sync((item.scene ?? []).filter((l) => l.kind !== "package"));
      release = () => scene.destroy();
    } else {
      el.addClass("is-icon");
      setIcon(el, item.type === "web" ? "globe" : "package");
    }
    return () => {
      release();
      el.remove();
    };
  }

  /** Everything that can be added to the library, offered from the list's + button. */
  private showAddMenu(el: HTMLElement) {
    const { plugin } = this;
    const s = plugin.settings;
    const menu = new Menu();
    const add = (title: string, icon: string, action: () => void) => menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(action));

    add(t("set.add.file"), "file", () => new FilePicker(this.app, null, (file) => void this.addAndShow([file.path])).open());
    add(t("set.add.folder"), "folder", () => new FolderPicker(this.app, (folder) => void this.addFolder(folder)).open());
    add(t("set.add.url"), "link", () => new UrlModal(this.app, (source, type, name) => void this.addAndShow([source], type, name)).open());
    menu.addSeparator();
    add(t("cmd.newScene"), "layers", () => {
      this.closeSettings();
      void plugin.createScene();
    });
    add(t("cmd.newPackage"), "package", () => {
      const name = `${t("type.package")} ${s.items.filter((i) => i.type === "package").length + 1}`;
      void plugin.createPackage(name).then(() => this.redraw());
    });
    add(t("set.add.effects"), "sparkles", () => {
      for (const fx of DEFAULT_SETTINGS.items) {
        if (!s.items.some((i) => i.id === fx.id)) s.items.push({ ...fx });
      }
      // Effects added in later versions have no entry in older saved data.
      for (const id of EFFECT_IDS) {
        if (!s.items.some((i) => i.type === "effect" && i.source === id)) plugin.addItems([id], "effect", id.charAt(0).toUpperCase() + id.slice(1));
      }
      void this.save(true).then(() => this.redraw());
    });

    const rect = el.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom }, el.ownerDocument);
  }

  /** Add what a vault folder holds: a package, an exported scene, or loose images and videos. */
  private async addFolder(folder: TFolder) {
    const { plugin } = this;
    const s = plugin.settings;
    // A folder holding scenery.json is a wallpaper package, not a pile of media.
    if (!folder.isRoot() && (await hasManifest(this.app, folder.path))) {
      const manifest = await loadManifest(this.app, folder.path).catch(() => null);
      if (manifest?.type === "scene") {
        // An exported scene comes back as an ordinary, editable scene that stays linked to its folder.
        let item = s.items.find((i) => i.type === "scene" && i.folder === folder.path);
        if (item) {
          item.scene = importScene(manifest, folder.path);
        } else {
          item = { id: uid(), name: manifest.name || folder.name, type: "scene", source: "", scene: importScene(manifest, folder.path), folder: folder.path };
          s.items.push(item);
          new Notice(t("notice.added", { n: 1 }));
        }
        await plugin.setActive(item.id);
        plugin.reloadWallpaper();
        this.redraw();
      } else {
        void this.addAndShow([folder.path], "package", manifest?.name || folder.name);
      }
      return;
    }
    const prefix = folder.isRoot() ? "" : folder.path + "/";
    const paths = this.app.vault
      .getFiles()
      .filter((f) => f.path.startsWith(prefix) && ["image", "video"].includes(detectType(f.path) ?? ""))
      .map((f) => f.path)
      .sort();
    void this.addAndShow(paths);
  }

  private async addAndShow(sources: string[], type?: WallpaperType, name?: string) {
    const before = this.plugin.settings.items.length;
    const ids = this.plugin.addItems(sources, type, name);
    if (!ids.length) {
      new Notice(t("notice.noMedia"));
      return;
    }
    const added = this.plugin.settings.items.length - before;
    if (added) new Notice(t("notice.added", { n: added }));
    await this.plugin.setActive(ids[0]);
    this.redraw();
  }

  // ---- the current package's own settings ----

  private loadPackageManifest(item: WallpaperItem) {
    if (this.loading.has(item.id)) return;
    this.loading.add(item.id);
    loadManifest(this.app, item.source)
      .then(
        (manifest) => this.manifests.set(item.id, manifest),
        (e: unknown) => this.manifests.set(item.id, e instanceof Error ? e : new Error(String(e)))
      )
      .finally(() => {
        this.loading.delete(item.id);
        this.redraw();
      });
  }

  /** Controls generated from the properties a package declares in its manifest. */
  private packageGroup(item: WallpaperItem): SettingDefinitionItem[] {
    const { plugin } = this;
    const manifest = this.manifests.get(item.id);
    if (!manifest) {
      // Read from disk in the background; the group appears once it is known.
      this.loadPackageManifest(item);
      return [];
    }

    const failed = manifest instanceof Error;
    const items: SettingDefinition[] = [];
    if (failed) {
      items.push({ name: t("pkg.badManifest"), desc: manifest.message, searchable: false });
    } else {
      for (const [key, p] of Object.entries(manifest.properties ?? {})) {
        const base = { name: p.label || key, desc: p.description };
        const k = `${PACKAGE}${key}`;
        if (p.type === "slider") items.push({ ...base, control: { type: "slider", key: k, min: p.min ?? 0, max: p.max ?? 100, step: p.step ?? 1 } });
        else if (p.type === "toggle") items.push({ ...base, control: { type: "toggle", key: k } });
        else if (p.type === "color") items.push({ ...base, control: { type: "color", key: k } });
        else if (p.type === "select") items.push({ ...base, control: { type: "dropdown", key: k, options: selectOptions(p) } });
        else items.push({ ...base, control: { type: "text", key: k } });
      }
      if (manifest.permissions?.includes("note")) {
        items.push({ name: t("pkg.allowNote"), desc: t("pkg.allowNote.desc"), control: { type: "toggle", key: ALLOW_NOTE } });
      }
      const about = [manifest.description, manifest.author && `by ${manifest.author}`, manifest.version && `v${manifest.version}`].filter(Boolean);
      if (about.length) items.unshift({ name: about.join(" · "), searchable: false });
    }

    return [
      {
        type: "group",
        heading: t("pkg.settings", { name: item.name }),
        cls: "scenery-package",
        extraButtons: [
          (button) =>
            button
              .setIcon("refresh-cw")
              .setTooltip(t("cmd.reload"))
              .onClick(() => plugin.reloadWallpaper()),
          (button) =>
            button
              .setIcon("rotate-ccw")
              .setTooltip(t("pkg.reset"))
              .onClick(() => {
                item.values = {};
                if (!failed) plugin.packageChanged(item, manifest);
                this.redraw();
              }),
          ...(Platform.isDesktopApp && !failed
            ? [
                (button: ExtraButtonComponent) =>
                  button
                    .setIcon("folder-open")
                    .setTooltip(t("pkg.openFolder"))
                    .onClick(() => {
                      // Not in the public API, hence the guarded call.
                      (this.app as unknown as { showInFolder?: (path: string) => void }).showInFolder?.(`${item.source}/${manifest.entry || "index.html"}`);
                    }),
              ]
            : []),
        ],
        items,
      },
    ];
  }
}
