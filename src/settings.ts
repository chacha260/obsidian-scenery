import { App, FuzzySuggestModal, Modal, Notice, PluginSettingTab, Setting, TFile, TFolder } from "obsidian";
import { t } from "./i18n";
import type SceneryPlugin from "./main";
import { DEFAULT_SETTINGS, detectType, FitMode, ScenerySettings, WallpaperType } from "./types";

class FilePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private onPick: (file: TFile) => void) {
    super(app);
  }
  getItems() {
    return this.app.vault.getFiles().filter((f) => detectType(f.path));
  }
  getItemText(file: TFile) {
    return file.path;
  }
  onChooseItem(file: TFile) {
    this.onPick(file);
  }
}

class FolderPicker extends FuzzySuggestModal<TFolder> {
  constructor(app: App, private onPick: (folder: TFolder) => void) {
    super(app);
  }
  getItems() {
    return this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
  }
  getItemText(folder: TFolder) {
    return folder.path;
  }
  onChooseItem(folder: TFolder) {
    this.onPick(folder);
  }
}

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
        .setDesc(`${t(`type.${item.type}`)} · ${item.source}`)
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
          new FilePicker(this.app, (file) => void this.addAndShow([file.path])).open();
        })
      )
      .addButton((b) =>
        b.setButtonText(t("set.add.folder")).onClick(() => {
          new FolderPicker(this.app, (folder) => {
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
