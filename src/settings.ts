import { App, Modal, Notice, Platform, PluginSettingTab, Setting } from "obsidian";
import { loadManifest, MANIFEST_FILE, PackageManifest, resolveValues, selectOptions } from "./package";
import { t } from "./i18n";
import type SceneryPlugin from "./main";
import { FilePicker, FolderPicker } from "./pickers";
import { DEFAULT_SETTINGS, detectType, FitMode, ScenerySettings, WallpaperItem, WallpaperType } from "./types";

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
      text.inputEl.style.width = "100%";
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

type NumericKey = {
  [K in keyof ScenerySettings]: ScenerySettings[K] extends number ? K : never;
}[keyof ScenerySettings];

export class ScenerySettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SceneryPlugin) {
    super(app, plugin);
  }

  private closeSettings() {
    // No public API closes the settings window; this one is long-standing and widely used.
    (this.app as unknown as { setting?: { close?: () => void } }).setting?.close?.();
  }

  private async commit(full = false) {
    await this.plugin.saveSettings();
    if (full) this.plugin.refresh();
    else this.plugin.applyStyle();
  }

  private slider(
    el: HTMLElement,
    key: NumericKey,
    name: string,
    range: [number, number, number],
    desc?: string,
    full = false
  ) {
    const setting = new Setting(el).setName(name);
    if (desc) setting.setDesc(desc);
    setting
      .addSlider((s) =>
        s
          .setLimits(...range)
          .setValue(this.plugin.settings[key])
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings[key] = v;
            await this.commit(full);
          })
      )
      .addExtraButton((b) =>
        b.setIcon("rotate-ccw").onClick(async () => {
          this.plugin.settings[key] = DEFAULT_SETTINGS[key];
          await this.commit(full);
          this.display();
        })
      );
  }

  /** Controls generated from the properties a package declares in scenery.json. */
  private async renderPackage(el: HTMLElement, item: WallpaperItem) {
    const { plugin } = this;
    let manifest: PackageManifest;
    try {
      manifest = await loadManifest(this.app, item.source);
    } catch (e) {
      new Setting(el).setName(item.name).setHeading();
      el.createEl("p", { text: `${t("pkg.badManifest")} ${String(e)}`, cls: "setting-item-description" });
      return;
    }
    const redraw = () => {
      el.empty();
      void this.renderPackage(el, item);
    };
    const changed = () => plugin.packageChanged(item, manifest);
    const values = resolveValues(manifest, item.values);
    const set = (key: string, value: unknown) => {
      (item.values ??= {})[key] = value;
      changed();
    };

    const about = [manifest.description, manifest.author && `by ${manifest.author}`, manifest.version && `v${manifest.version}`];
    const head = new Setting(el)
      .setName(t("pkg.settings", { name: item.name }))
      .setDesc(about.filter(Boolean).join(" · "))
      .setHeading()
      .addExtraButton((b) =>
        b
          .setIcon("refresh-cw")
          .setTooltip(t("cmd.reload"))
          .onClick(() => {
            plugin.reloadWallpaper();
            redraw();
          })
      )
      .addExtraButton((b) =>
        b
          .setIcon("rotate-ccw")
          .setTooltip(t("pkg.reset"))
          .onClick(() => {
            item.values = {};
            changed();
            redraw();
          })
      );
    if (Platform.isDesktopApp) {
      head.addExtraButton((b) =>
        b
          .setIcon("folder-open")
          .setTooltip(t("pkg.openFolder"))
          .onClick(() => {
            // Not in the public API, hence the guarded call.
            (this.app as unknown as { showInFolder?: (path: string) => void }).showInFolder?.(`${item.source}/${MANIFEST_FILE}`);
          })
      );
    }

    for (const [key, p] of Object.entries(manifest.properties ?? {})) {
      const setting = new Setting(el).setName(p.label || key);
      if (p.description) setting.setDesc(p.description);
      if (p.type === "slider") {
        setting.addSlider((sl) => {
          sl.setLimits(p.min ?? 0, p.max ?? 100, p.step ?? 1).setValue(values[key] as number).setDynamicTooltip();
          sl.sliderEl.addEventListener("input", () => set(key, Number(sl.sliderEl.value)));
          sl.onChange((v) => set(key, v));
        });
      } else if (p.type === "toggle") {
        setting.addToggle((tg) => tg.setValue(values[key] as boolean).onChange((v) => set(key, v)));
      } else if (p.type === "color") {
        setting.addColorPicker((c) => c.setValue(values[key] as string).onChange((v) => set(key, v)));
      } else if (p.type === "select") {
        setting.addDropdown((d) => d.addOptions(selectOptions(p)).setValue(values[key] as string).onChange((v) => set(key, v)));
      } else {
        setting.addText((tx) => tx.setValue(values[key] as string).onChange((v) => set(key, v)));
      }
    }

    if (manifest.permissions?.includes("note")) {
      new Setting(el)
        .setName(t("pkg.allowNote"))
        .setDesc(t("pkg.allowNote.desc"))
        .addToggle((tg) =>
          tg.setValue(!!item.allowNote).onChange((v) => {
            item.allowNote = v;
            changed();
          })
        );
    }
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
    this.display();
  }

  display() {
    const { containerEl } = this;
    const { plugin } = this;
    const s = plugin.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName(t("set.enabled"))
      .setDesc(t("set.enabled.desc"))
      .addToggle((tg) =>
        tg.setValue(s.enabled).onChange(async (v) => {
          s.enabled = v;
          await this.commit(true);
        })
      );

    // ---- Library ----
    new Setting(containerEl).setName(t("set.library")).setHeading();
    if (!s.items.length) containerEl.createEl("p", { text: t("set.library.empty"), cls: "setting-item-description" });
    for (const item of s.items) {
      const active = item.id === s.activeId;
      const row = new Setting(containerEl)
        .setName(item.name)
        .setDesc(
          item.type === "scene"
            ? `${t("type.scene")} · ${t("set.layerCount", { n: item.scene?.length ?? 0 })}`
            : `${t(`type.${item.type}`)} · ${item.source}`
        );
      if (item.type === "scene") {
        row.addExtraButton((b) =>
          b
            .setIcon("pencil")
            .setTooltip(t("cmd.editScene"))
            .onClick(() => {
              this.closeSettings();
              void plugin.openEditor(item.id);
            })
        );
      }
      row
        .addButton((b) => {
          b.setButtonText(active ? t("set.active") : t("set.use")).setDisabled(active);
          if (active) b.setCta();
          b.onClick(async () => {
            await plugin.setActive(item.id);
            this.display();
          });
        })
        .addExtraButton((b) =>
          b
            .setIcon("trash-2")
            .setTooltip(t("set.remove"))
            .onClick(async () => {
              s.items = s.items.filter((i) => i.id !== item.id);
              if (active) s.activeId = s.items[0]?.id ?? null;
              await this.commit(true);
              this.display();
            })
        );
      row.settingEl.addClass("scenery-item");
      row.settingEl.toggleClass("is-active", active);
    }

    new Setting(containerEl)
      .setName(t("set.add"))
      .setDesc(t("set.add.desc"))
      .addButton((b) =>
        b.setButtonText(t("set.add.file")).onClick(() => {
          new FilePicker(this.app, null, (file) => void this.addAndShow([file.path])).open();
        })
      )
      .addButton((b) =>
        b.setButtonText(t("set.add.folder")).onClick(() => {
          new FolderPicker(this.app, async (folder) => {
            // A folder holding scenery.json is a wallpaper package, not a pile of media.
            if (!folder.isRoot() && (await this.app.vault.adapter.exists(`${folder.path}/${MANIFEST_FILE}`))) {
              const name = await loadManifest(this.app, folder.path).then((m) => m.name, () => undefined);
              void this.addAndShow([folder.path], "package", name || folder.name);
              return;
            }
            const prefix = folder.isRoot() ? "" : folder.path + "/";
            const paths = this.app.vault
              .getFiles()
              .filter((f) => f.path.startsWith(prefix) && ["image", "video"].includes(detectType(f.path) ?? ""))
              .map((f) => f.path)
              .sort();
            void this.addAndShow(paths);
          }).open();
        })
      )
      .addButton((b) =>
        b.setButtonText(t("set.add.url")).onClick(() => {
          new UrlModal(this.app, (source, type, name) => void this.addAndShow([source], type, name)).open();
        })
      )
      .addButton((b) =>
        b.setButtonText(t("cmd.newPackage")).onClick(async () => {
          const name = `${t("type.package")} ${s.items.filter((i) => i.type === "package").length + 1}`;
          if (await plugin.createPackage(name)) this.display();
        })
      )
      .addButton((b) =>
        b
          .setButtonText(t("cmd.newScene"))
          .setCta()
          .onClick(() => {
            this.closeSettings();
            void plugin.createScene();
          })
      )
      .addExtraButton((b) =>
        b
          .setIcon("sparkles")
          .setTooltip(t("set.add.effects"))
          .onClick(async () => {
            for (const fx of DEFAULT_SETTINGS.items) {
              if (!s.items.some((i) => i.id === fx.id)) s.items.push({ ...fx });
            }
            await this.commit(true);
            this.display();
          })
      );

    const active = plugin.activeItem;
    if (active?.type === "package") void this.renderPackage(containerEl.createDiv(), active);

    // ---- Appearance ----
    new Setting(containerEl).setName(t("set.appearance")).setHeading();
    new Setting(containerEl)
      .setName(t("set.fit"))
      .setDesc(t("set.fit.desc"))
      .addDropdown((d) =>
        d
          .addOptions({ cover: t("set.fit.cover"), contain: t("set.fit.contain"), fill: t("set.fit.fill") })
          .setValue(s.fit)
          .onChange(async (v) => {
            s.fit = v as FitMode;
            await this.commit();
          })
      );
    this.slider(containerEl, "dim", t("set.dim"), [0, 100, 1], t("set.dim.desc"));
    this.slider(containerEl, "panelTint", t("set.panelTint"), [0, 100, 1], t("set.panelTint.desc"));
    this.slider(containerEl, "blur", t("set.blur"), [0, 40, 1]);
    this.slider(containerEl, "brightness", t("set.brightness"), [20, 150, 1]);
    this.slider(containerEl, "saturation", t("set.saturation"), [0, 200, 1]);
    this.slider(containerEl, "parallax", t("set.parallax"), [0, 40, 1], t("set.parallax.desc"));

    // ---- Playback ----
    new Setting(containerEl).setName(t("set.playback")).setHeading();
    this.slider(containerEl, "volume", t("set.volume"), [0, 100, 1], t("set.volume.desc"));
    this.slider(containerEl, "playbackRate", t("set.rate"), [0.25, 2, 0.05]);
    this.slider(containerEl, "fps", t("set.fps"), [10, 60, 5], t("set.fps.desc"));
    new Setting(containerEl)
      .setName(t("set.pauseOnBlur"))
      .setDesc(t("set.pauseOnBlur.desc"))
      .addToggle((tg) =>
        tg.setValue(s.pauseOnBlur).onChange(async (v) => {
          s.pauseOnBlur = v;
          await this.commit(true);
        })
      );

    // ---- Slideshow ----
    new Setting(containerEl).setName(t("set.slideshow")).setHeading();
    new Setting(containerEl).setName(t("set.slideshow.enable")).addToggle((tg) =>
      tg.setValue(s.slideshow).onChange(async (v) => {
        s.slideshow = v;
        await this.commit(true);
      })
    );
    this.slider(containerEl, "intervalMinutes", t("set.interval"), [1, 120, 1], undefined, true);
    new Setting(containerEl).setName(t("set.shuffle")).addToggle((tg) =>
      tg.setValue(s.shuffle).onChange(async (v) => {
        s.shuffle = v;
        await this.commit(true);
      })
    );
  }
}
