import { ItemView, Menu, Setting, WorkspaceLeaf, setIcon } from "obsidian";
import { t } from "./i18n";
import type SceneryPlugin from "./main";
import { loadManifest } from "./package";
import { FilePicker, PackagePicker } from "./pickers";
import { renderProperties } from "./propsui";
import {
  BLEND_MODES,
  EFFECT_IDS,
  FitMode,
  LayerKind,
  MOTIONS,
  SceneLayer,
  WallpaperItem,
  newLayer,
  uid,
} from "./types";

export const EDITOR_VIEW = "scenery-scene-editor";

type NumericKey = {
  [K in keyof SceneLayer]-?: SceneLayer[K] extends number ? K : never;
}[keyof SceneLayer];

const KIND_ICON: Record<LayerKind, string> = { image: "image", video: "film", effect: "sparkles", color: "palette", package: "package" };

/** Sidebar panel for composing a scene while watching the real wallpaper behind the workspace. */
export class SceneEditorView extends ItemView {
  private selectedId: string | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: SceneryPlugin) {
    super(leaf);
  }

  getViewType() {
    return EDITOR_VIEW;
  }
  getDisplayText() {
    return t("editor.title");
  }
  getIcon() {
    return "layers";
  }

  async onOpen() {
    this.render();
  }

  async onClose() {
    document.body.classList.remove("scenery-preview");
  }

  private get scenes(): WallpaperItem[] {
    return this.plugin.settings.items.filter((i) => i.type === "scene");
  }

  private get scene(): WallpaperItem | null {
    return this.scenes.find((i) => i.id === this.plugin.editingId) ?? null;
  }

  /** Push edits to the wallpaper. Pass `true` when the panel itself needs redrawing. */
  private changed(redraw = false) {
    this.plugin.sceneChanged();
    if (redraw) this.render();
  }

  render() {
    const el = this.contentEl;
    el.empty();
    el.addClass("scenery-editor");
    const scene = this.scene;

    new Setting(el)
      .setName(t("editor.scene"))
      .addDropdown((d) => {
        for (const s of this.scenes) d.addOption(s.id, s.name);
        if (scene) d.setValue(scene.id);
        d.onChange((id) => void this.plugin.openEditor(id));
      })
      .addExtraButton((b) =>
        b
          .setIcon("plus")
          .setTooltip(t("cmd.newScene"))
          .onClick(() => void this.plugin.createScene())
      );

    if (!scene) {
      el.createEl("p", { text: t("editor.empty"), cls: "scenery-editor-hint" });
      return;
    }
    const layers = (scene.scene ??= []);

    new Setting(el)
      .setName(t("editor.name"))
      .addText((text) =>
        text.setValue(scene.name).onChange((v) => {
          scene.name = v || t("type.scene");
          this.changed();
        })
      )
      .addExtraButton((b) =>
        b
          .setIcon("download")
          .setTooltip(t("cmd.exportScene"))
          .onClick(() => void this.plugin.exportScene(scene.id))
      );
    new Setting(el)
      .setName(t("editor.noDim"))
      .setDesc(t("editor.noDim.desc"))
      .addToggle((tg) =>
        tg
          .setValue(document.body.classList.contains("scenery-preview"))
          .onChange((v) => document.body.classList.toggle("scenery-preview", v))
      );

    new Setting(el)
      .setName(t("editor.layers"))
      .setHeading()
      .addButton((b) =>
        b
          .setButtonText(t("editor.addLayer"))
          .setCta()
          .onClick((evt) => {
            const menu = new Menu();
            for (const kind of ["image", "video", "effect", "color", "package"] as LayerKind[]) {
              menu.addItem((item) =>
                item
                  .setTitle(t(`kind.${kind}`))
                  .setIcon(KIND_ICON[kind])
                  .onClick(() => {
                    const layer = newLayer(kind, t(`kind.${kind}`));
                    layers.push(layer);
                    this.selectedId = layer.id;
                    this.changed(true);
                  })
              );
            }
            menu.showAtMouseEvent(evt);
          })
      );

    if (!layers.length) el.createEl("p", { text: t("editor.noLayers"), cls: "scenery-editor-hint" });

    // Topmost layer first, like image editors.
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const selected = layer.id === this.selectedId;
      const row = el.createDiv({ cls: "scenery-layer-row" });
      row.toggleClass("is-selected", selected);
      row.toggleClass("is-hidden", !layer.visible);

      const button = (icon: string, label: string, disabled: boolean, action: () => void) => {
        const b = row.createDiv({ cls: "clickable-icon" });
        setIcon(b, icon);
        b.setAttribute("aria-label", label);
        b.toggleClass("is-disabled", disabled);
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!disabled) action();
        });
      };
      const swap = (a: number, b: number) => {
        [layers[a], layers[b]] = [layers[b], layers[a]];
        this.changed(true);
      };

      button(layer.visible ? "eye" : "eye-off", t("editor.visible"), false, () => {
        layer.visible = !layer.visible;
        this.changed(true);
      });
      const name = row.createDiv({ cls: "scenery-layer-name" });
      name.createSpan({ text: layer.name });
      name.createSpan({ text: `  ${t(`kind.${layer.kind}`)}`, cls: "scenery-layer-kind" });
      button("arrow-up", t("editor.up"), i === layers.length - 1, () => swap(i, i + 1));
      button("arrow-down", t("editor.down"), i === 0, () => swap(i, i - 1));
      button("copy", t("editor.duplicate"), false, () => {
        const copy = { ...layer, id: uid(), name: `${layer.name} 2` };
        layers.splice(i + 1, 0, copy);
        this.selectedId = copy.id;
        this.changed(true);
      });
      button("trash-2", t("set.remove"), false, () => {
        layers.splice(i, 1);
        this.changed(true);
      });
      row.addEventListener("click", () => {
        this.selectedId = selected ? null : layer.id;
        this.render();
      });

      if (selected) this.renderProps(el.createDiv({ cls: "scenery-layer-props" }), layer);
    }
  }

  private slider(el: HTMLElement, layer: SceneLayer, key: NumericKey, name: string, range: [number, number, number], desc?: string) {
    const setting = new Setting(el).setName(name);
    if (desc) setting.setDesc(desc);
    setting.addSlider((s) => {
      s.setLimits(...range).setValue(layer[key]).setDynamicTooltip();
      // Update the wallpaper while dragging, not only on release.
      s.sliderEl.addEventListener("input", () => {
        layer[key] = Number(s.sliderEl.value);
        this.changed();
      });
      s.onChange((v) => {
        layer[key] = v;
        this.changed();
      });
    });
  }

  private renderProps(el: HTMLElement, layer: SceneLayer) {
    new Setting(el).setName(t("editor.name")).addText((text) => {
      text.setValue(layer.name);
      // Commit on blur/Enter so the layer list is not rebuilt on every keystroke.
      text.inputEl.addEventListener("change", () => {
        layer.name = text.getValue() || t(`kind.${layer.kind}`);
        this.changed(true);
      });
    });

    if (layer.kind === "image" || layer.kind === "video") {
      const kind = layer.kind;
      new Setting(el)
        .setName(t("editor.source"))
        .setDesc(t("editor.source.desc"))
        .addText((text) => {
          text.setValue(layer.source).setPlaceholder("wallpapers/…");
          text.inputEl.addEventListener("change", () => {
            layer.source = text.getValue().trim();
            this.changed();
          });
        })
        .addExtraButton((b) =>
          b
            .setIcon("folder-open")
            .setTooltip(t("set.add.file"))
            .onClick(() => {
              new FilePicker(this.app, [kind], (file) => {
                layer.source = file.path;
                if (layer.name === t(`kind.${kind}`)) layer.name = file.basename;
                this.changed(true);
              }).open();
            })
        );
      new Setting(el).setName(t("set.fit")).addDropdown((d) =>
        d
          .addOptions({ cover: t("set.fit.cover"), contain: t("set.fit.contain"), fill: t("set.fit.fill") })
          .setValue(layer.fit)
          .onChange((v) => {
            layer.fit = v as FitMode;
            this.changed();
          })
      );
    }

    if (layer.kind === "package") {
      new Setting(el)
        .setName(t("kind.package"))
        .setDesc(t("editor.package.desc"))
        .addText((text) => {
          text.setValue(layer.source).setPlaceholder("Scenery/…");
          text.inputEl.addEventListener("change", () => {
            layer.source = text.getValue().trim().replace(/\/+$/, "");
            layer.values = {};
            this.changed(true);
          });
        })
        .addExtraButton((b) =>
          b
            .setIcon("folder-open")
            .setTooltip(t("set.add.folder"))
            .onClick(() => {
              new PackagePicker(this.app, (folder) => {
                layer.source = folder.path;
                layer.values = {};
                if (layer.name === t("kind.package")) layer.name = folder.name;
                this.changed(true);
              }).open();
            })
        );
      if (layer.source) {
        // The manifest is read from disk, so its controls arrive a moment after the rest.
        const box = el.createDiv();
        loadManifest(this.app, layer.source).then(
          (manifest) =>
            renderProperties(box, manifest, layer.values, (key, value) => {
              (layer.values ??= {})[key] = value;
              this.changed();
            }),
          (e) => box.createEl("p", { text: `${t("pkg.badManifest")} ${String(e)}`, cls: "scenery-editor-hint" })
        );
      }
    }

    if (layer.kind === "effect") {
      new Setting(el).setName(t("kind.effect")).addDropdown((d) => {
        for (const id of EFFECT_IDS) d.addOption(id, id.charAt(0).toUpperCase() + id.slice(1));
        d.setValue(layer.source).onChange((v) => {
          layer.source = v;
          this.changed();
        });
      });
      new Setting(el).setName(t("editor.themeColor")).addToggle((tg) =>
        tg.setValue(layer.themeColor).onChange((v) => {
          layer.themeColor = v;
          this.changed(true);
        })
      );
    }

    if (layer.kind === "color" || (layer.kind === "effect" && !layer.themeColor)) {
      const colors = new Setting(el).setName(t("editor.color")).addColorPicker((c) =>
        c.setValue(layer.color).onChange((v) => {
          layer.color = v;
          this.changed();
        })
      );
      if (layer.kind === "color") {
        if (layer.gradient) {
          colors.addColorPicker((c) =>
            c.setValue(layer.color2).onChange((v) => {
              layer.color2 = v;
              this.changed();
            })
          );
        }
        new Setting(el).setName(t("editor.gradient")).addToggle((tg) =>
          tg.setValue(layer.gradient).onChange((v) => {
            layer.gradient = v;
            this.changed(true);
          })
        );
        if (layer.gradient) this.slider(el, layer, "angle", t("editor.angle"), [0, 360, 5]);
      }
    }

    this.slider(el, layer, "opacity", t("editor.opacity"), [0, 100, 1]);
    new Setting(el)
      .setName(t("editor.blend"))
      .setDesc(t("editor.blend.desc"))
      .addDropdown((d) => {
        for (const mode of BLEND_MODES) d.addOption(mode, t(`blend.${mode}`));
        d.setValue(layer.blend).onChange((v) => {
          layer.blend = v as SceneLayer["blend"];
          this.changed();
        });
      });
    this.slider(el, layer, "blur", t("set.blur"), [0, 40, 1]);
    this.slider(el, layer, "scale", t("editor.scale"), [20, 300, 1]);
    this.slider(el, layer, "x", t("editor.x"), [-100, 100, 1]);
    this.slider(el, layer, "y", t("editor.y"), [-100, 100, 1]);

    new Setting(el).setName(t("editor.motion")).addDropdown((d) => {
      for (const m of MOTIONS) d.addOption(m, t(`motion.${m}`));
      d.setValue(layer.motion).onChange((v) => {
        layer.motion = v as SceneLayer["motion"];
        this.changed(true);
      });
    });
    if (layer.motion !== "none") {
      if (layer.motion !== "rotate") this.slider(el, layer, "amount", t("editor.amount"), [0, 100, 1]);
      this.slider(el, layer, "period", t("editor.period"), [1, 180, 1]);
    }
    this.slider(el, layer, "depth", t("editor.depth"), [-200, 200, 5], t("editor.depth.desc"));
  }
}
