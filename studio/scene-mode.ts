import { t } from "../src/i18n";
import type { PackageManifest } from "../src/package";
import { SceneRuntime } from "../src/scene";
import { importScene } from "../src/sceneio";
import { BLEND_MODES, DEFAULT_SETTINGS, detectType, EFFECT_IDS, LayerKind, MOTIONS, newLayer, SceneLayer, uid } from "../src/types";
import { moveItem, reorderable } from "../src/dnd";
import * as form from "./form";
import type { Stage } from "./stage";
import type { MemoryVault } from "./vault";

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Compose a scene from layers, with the result shown live on the stage. */
export class SceneMode {
  name = t("type.scene");
  layers: SceneLayer[] = [
    newLayer("color", t("kind.color")),
    newLayer("effect", "Aurora", { source: "aurora", opacity: 70 }),
    newLayer("effect", "Fireflies", { source: "fireflies", themeColor: false, depth: 100 }),
  ];
  private selectedId: string | null = null;
  private runtime: SceneRuntime | null = null;
  private paused = false;

  constructor(private vault: MemoryVault, private stage: Stage, private panel: HTMLElement, private onChange: () => void) {}

  private get selected() {
    return this.layers.find((l) => l.id === this.selectedId) ?? null;
  }

  activate() {
    this.runtime = new SceneRuntime(this.vault.app, this.stage.content, () => DEFAULT_SETTINGS);
    this.runtime.setPaused(this.paused);
    this.stage.onPointer = (p) => this.runtime?.setPointer(p);
    this.stage.onDrag = (dx, dy) => {
      const layer = this.selected;
      if (!layer) return;
      layer.x = Math.round((layer.x + dx) * 10) / 10;
      layer.y = Math.round((layer.y + dy) * 10) / 10;
      this.changed();
    };
    this.stage.onWheel = (direction) => {
      const layer = this.selected;
      if (!layer) return;
      layer.scale = Math.min(300, Math.max(20, layer.scale + direction * 2));
      this.changed();
      this.render();
    };
    // The sliders are only refreshed once the drag is over, so they do not fight the pointer.
    this.stage.onDragEnd = () => this.render();
    this.sync();
    this.render();
  }

  deactivate() {
    this.runtime?.destroy();
    this.runtime = null;
    this.stage.showOutline(null);
  }

  private sync() {
    this.runtime?.sync(this.layers);
    const layer = this.selected;
    this.stage.showOutline(layer && (layer.x || layer.y || layer.scale !== 100) ? layer : null);
  }

  private changed(redraw = false) {
    this.sync();
    this.onChange();
    if (redraw) this.render();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.runtime?.setPaused(paused);
  }

  themeChanged() {
    this.runtime?.themeChanged();
  }

  /** Turn dropped or picked files into layers. */
  addFiles(files: File[]) {
    for (const file of files) {
      const kind = detectType(file.name);
      if (kind !== "image" && kind !== "video") continue;
      const path = this.vault.freeName("assets", file.name);
      this.vault.put(path, file);
      const layer = newLayer(kind, file.name.replace(/\.[^.]*$/, ""), { source: path });
      this.layers.push(layer);
      this.selectedId = layer.id;
    }
    this.changed(true);
  }

  private pickFiles(kind: "image" | "video") {
    const input = document.body.createEl("input");
    input.type = "file";
    input.accept = `${kind}/*`;
    input.multiple = true;
    input.hidden = true;
    input.addEventListener("change", () => {
      this.addFiles(Array.from(input.files ?? []));
      input.remove();
    });
    input.click();
  }

  // ---- saving and loading ----

  /** The scene as files: scenery.json plus every project file its layers use. */
  files(): Map<string, Blob> {
    const out = new Map<string, Blob>();
    const layers = this.layers.map((layer) => {
      const local = !!layer.source && layer.kind !== "effect" && layer.kind !== "color" &&
        (this.vault.has(layer.source) || this.vault.paths().some((p) => p.startsWith(`${layer.source}/`)));
      if (!local) return layer;
      for (const path of this.vault.paths()) {
        if (path === layer.source || path.startsWith(`${layer.source}/`)) out.set(path, this.vault.get(path) as Blob);
      }
      return { ...layer, source: `./${layer.source}` };
    });
    const manifest: PackageManifest = { name: this.name, version: "1.0.0", type: "scene", layers };
    out.set("scenery.json", new Blob([JSON.stringify(manifest, null, 2) + "\n"], { type: "application/json" }));
    return out;
  }

  load(manifest: PackageManifest, files: Map<string, Blob>) {
    for (const [path, blob] of files) if (path !== "scenery.json") this.vault.put(path, blob);
    this.name = manifest.name || t("type.scene");
    this.layers = importScene(manifest, "");
    this.selectedId = null;
  }

  // ---- panel ----

  render() {
    const el = this.panel;
    el.empty();
    form.text(el, t("editor.name"), this.name, (v) => {
      this.name = v || t("type.scene");
      this.onChange();
    }, true);

    const head = el.createDiv({ cls: "panel-head" });
    head.createEl("h2", { text: t("editor.layers") });
    const add = head.createEl("select", { cls: "add-layer" });
    add.createEl("option", { text: `+ ${t("editor.addLayer")}` }).value = "";
    for (const kind of ["image", "video", "effect", "color"] as LayerKind[]) add.createEl("option", { text: t(`kind.${kind}`) }).value = kind;
    add.addEventListener("change", () => {
      const kind = add.value as LayerKind;
      add.value = "";
      if (kind === "image" || kind === "video") return this.pickFiles(kind);
      const layer = newLayer(kind, t(`kind.${kind}`));
      this.layers.push(layer);
      this.selectedId = layer.id;
      this.changed(true);
    });

    if (!this.layers.length) el.createEl("p", { text: t("studio.dropHint"), cls: "hint" });

    // Topmost layer first, like image editors.
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      const selected = layer.id === this.selectedId;
      const row = el.createDiv({ cls: "layer-row" });
      row.toggleClass("is-selected", selected);
      row.toggleClass("is-hidden", !layer.visible);
      const icon = (label: string, glyph: string, action: () => void) => {
        const b = form.button(row, glyph, (e) => {
          e.stopPropagation();
          action();
        }, "icon");
        b.title = label;
      };
      icon(t("editor.visible"), layer.visible ? "●" : "○", () => {
        layer.visible = !layer.visible;
        this.changed(true);
      });
      const name = row.createDiv({ cls: "layer-name" });
      name.createSpan({ text: layer.name });
      name.createSpan({ text: t(`kind.${layer.kind}`), cls: "layer-kind" });
      icon(t("editor.duplicate"), "⧉", () => {
        const copy = { ...layer, id: uid(), name: `${layer.name} 2` };
        this.layers.splice(i + 1, 0, copy);
        this.selectedId = copy.id;
        this.changed(true);
      });
      icon(t("set.remove"), "✕", () => {
        this.layers.splice(i, 1);
        this.changed(true);
      });
      reorderable(row, "studio-layers", i, (from, to) => {
        moveItem(this.layers, from, to);
        this.changed(true);
      });
      row.addEventListener("click", () => {
        this.selectedId = selected ? null : layer.id;
        this.sync();
        this.render();
      });
      if (selected) this.renderProps(el.createDiv({ cls: "layer-props" }), layer);
    }
    el.createEl("p", { text: t("studio.dragHint"), cls: "hint" });
  }

  private renderProps(el: HTMLElement, layer: SceneLayer) {
    const set = <K extends keyof SceneLayer>(key: K, redraw = false) => (value: SceneLayer[K]) => {
      layer[key] = value;
      this.changed(redraw);
    };
    form.text(el, t("editor.name"), layer.name, (v) => set("name", true)(v || t(`kind.${layer.kind}`)));

    if (layer.kind === "image" || layer.kind === "video" || layer.kind === "package") {
      form.text(el, t("editor.source"), layer.source, (v) => set("source")(v.trim()), false, t("studio.urlLayer"));
    }
    if (layer.kind === "image" || layer.kind === "video") {
      form.select(el, t("set.fit"), layer.fit, { cover: t("set.fit.cover"), contain: t("set.fit.contain"), fill: t("set.fit.fill") }, (v) => set("fit")(v as SceneLayer["fit"]));
    }
    if (layer.kind === "effect") {
      form.select(el, t("kind.effect"), layer.source, Object.fromEntries(EFFECT_IDS.map((id) => [id, capital(id)])), set("source"));
      form.toggle(el, t("editor.themeColor"), layer.themeColor, set("themeColor", true));
    }
    if (layer.kind === "color" || (layer.kind === "effect" && !layer.themeColor)) {
      form.color(el, t("editor.color"), layer.color, set("color"));
    }
    if (layer.kind === "color") {
      form.toggle(el, t("editor.gradient"), layer.gradient, set("gradient", true));
      if (layer.gradient) {
        form.color(el, `${t("editor.color")} 2`, layer.color2, set("color2"));
        form.slider(el, t("editor.angle"), layer.angle, [0, 360, 5], set("angle"));
      }
    }
    form.slider(el, t("editor.opacity"), layer.opacity, [0, 100, 1], set("opacity"));
    form.select(el, t("editor.blend"), layer.blend, Object.fromEntries(BLEND_MODES.map((m) => [m, t(`blend.${m}`)])), (v) => set("blend")(v as SceneLayer["blend"]));
    form.slider(el, t("set.blur"), layer.blur, [0, 40, 1], set("blur"));
    form.slider(el, t("editor.scale"), layer.scale, [20, 300, 1], set("scale"));
    form.slider(el, t("editor.x"), layer.x, [-100, 100, 0.5], set("x"));
    form.slider(el, t("editor.y"), layer.y, [-100, 100, 0.5], set("y"));
    form.select(el, t("editor.motion"), layer.motion, Object.fromEntries(MOTIONS.map((m) => [m, t(`motion.${m}`)])), (v) => set("motion", true)(v as SceneLayer["motion"]));
    if (layer.motion !== "none") {
      if (layer.motion !== "rotate") form.slider(el, t("editor.amount"), layer.amount, [0, 100, 1], set("amount"));
      form.slider(el, t("editor.period"), layer.period, [1, 180, 1], set("period"));
    }
    form.slider(el, t("editor.depth"), layer.depth, [-200, 200, 5], set("depth"));
  }
}
