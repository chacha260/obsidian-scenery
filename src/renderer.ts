import { App, Notice } from "obsidian";
import { EffectPlayer } from "./effects";
import { t } from "./i18n";
import { makeState, NoteInfo, PackageFrame, PackageManifest, PackageState, readTheme, resolveValues } from "./package";
import { SceneRuntime } from "./scene";
import { resolveSource } from "./source";
import type { ScenerySettings, WallpaperItem } from "./types";

const FADE_MS = 1200;

interface Layer {
  el: HTMLElement;
  video?: HTMLVideoElement;
  effect?: EffectPlayer;
  scene?: SceneRuntime;
  /** Set for packages: the frame speaks the scenery message protocol. */
  pkg?: { frame: PackageFrame; item: WallpaperItem };
}

export class Renderer {
  private root: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private current: Layer | null = null;
  private currentKey = "";
  private token = 0;
  private paused = false;
  private pointerFrame = 0;

  private pointer = { x: 0.5, y: 0.5 };

  private doc: Document;

  /** One renderer per window: the main window and, optionally, each pop-out. */
  constructor(
    private app: App,
    private win: Window,
    private getSettings: () => ScenerySettings,
    private getNote: () => NoteInfo | null
  ) {
    this.doc = win.document;
  }

  private noteFor(item: WallpaperItem, manifest: PackageManifest): NoteInfo | null {
    return item.allowNote && manifest.permissions?.includes("note") ? this.getNote() : null;
  }

  private post(key: keyof PackageState, value: unknown) {
    this.current?.pkg?.frame.post(key, value);
  }

  /** Re-send property values and note access after the user changed them. */
  updatePackage(item: WallpaperItem, manifest: PackageManifest) {
    const pkg = this.current?.pkg;
    if (!pkg || pkg.item.id !== item.id) return;
    pkg.frame.manifest = manifest;
    this.post("props", resolveValues(manifest, item.values));
    this.post("note", this.noteFor(item, manifest));
  }

  noteChanged() {
    const pkg = this.current?.pkg;
    if (pkg?.frame.manifest) this.post("note", this.noteFor(pkg.item, pkg.frame.manifest));
  }

  /** Load the current wallpaper again, e.g. after its files changed on disk. */
  reload(item: WallpaperItem | null) {
    this.currentKey = "";
    this.show(item);
  }

  private showPackage(item: WallpaperItem, layer: Layer, reveal: () => void, fail: () => void) {
    const frame = new PackageFrame(this.app, layer.el, item.source, (manifest) =>
      makeState(manifest, item.values, {
        doc: this.doc,
        paused: this.paused,
        pointer: this.pointer,
        note: this.noteFor(item, manifest),
        fps: this.getSettings().fps,
      })
    );
    layer.pkg = { frame, item };
    frame.loaded.then(reveal, (e) => {
      console.error("Scenery: could not load package", item.source, e);
      fail();
    });
  }

  mount() {
    if (this.root) return;
    this.root = this.doc.body.createDiv({ cls: "scenery-root" });
    this.stage = this.root.createDiv({ cls: "scenery-stage" });
    this.root.createDiv({ cls: "scenery-dim" });
    this.root.classList.toggle("is-paused", this.paused);
    this.doc.body.prepend(this.root);
    this.doc.body.classList.add("scenery-active");
  }

  unmount() {
    this.token++;
    if (this.current) this.dispose(this.current);
    this.current = null;
    this.currentKey = "";
    this.root?.remove();
    this.root = this.stage = null;
    this.doc.body.classList.remove("scenery-active");
    this.doc.body.style.removeProperty("--scenery-panel");
  }

  /** Push appearance and playback settings to the DOM. Cheap; safe to call often. */
  applyStyle() {
    const s = this.getSettings();
    const style = this.root?.style;
    if (!style) return;
    style.setProperty("--scenery-dim", String(s.dim / 100));
    style.setProperty("--scenery-blur", `${s.blur}px`);
    style.setProperty("--scenery-brightness", String(s.brightness / 100));
    style.setProperty("--scenery-saturation", String(s.saturation / 100));
    style.setProperty("--scenery-fit", s.fit);
    style.setProperty("--scenery-bleed", `${s.parallax + s.blur * 2}px`);
    this.doc.body.style.setProperty("--scenery-panel", `${s.panelTint}%`);
    this.applyPointer();
    const layer = this.current;
    if (layer?.video) this.configureVideo(layer.video);
    if (layer?.effect) layer.effect.fps = s.fps;
    layer?.scene?.applySettings();
  }

  private configureVideo(video: HTMLVideoElement) {
    const s = this.getSettings();
    video.muted = s.volume === 0;
    video.volume = s.volume / 100;
    video.playbackRate = s.playbackRate;
  }

  show(item: WallpaperItem | null) {
    if (!this.stage) return;
    const key = !item ? "" : item.type === "scene" ? `scene|${item.id}` : `${item.type}|${item.source}`;
    if (key === this.currentKey) {
      // Same scene, edited: patch it in place instead of cross-fading.
      if (item?.type === "scene") this.current?.scene?.sync(item.scene ?? []);
      return;
    }
    this.currentKey = key;
    const token = ++this.token;
    const previous = this.current;
    this.current = null;

    const retire = () => {
      if (!previous) return;
      previous.el.classList.remove("is-visible");
      window.setTimeout(() => this.dispose(previous), FADE_MS);
    };
    if (!item) return retire();

    const el = this.stage.createDiv({ cls: "scenery-layer" });
    const layer: Layer = { el };
    const reveal = () => {
      if (token !== this.token) return this.dispose(layer);
      // Force a style flush so the opacity transition runs.
      void el.offsetWidth;
      el.classList.add("is-visible");
      retire();
    };
    const fail = () => {
      new Notice(`${t("notice.loadFailed")}: ${item.name}`);
      this.dispose(layer);
      if (token === this.token) {
        this.current = previous;
        this.currentKey = "";
      }
    };
    this.current = layer;

    if (item.type === "package") {
      this.showPackage(item, layer, reveal, fail);
      return;
    }

    if (item.type === "scene") {
      layer.scene = new SceneRuntime(this.app, el, this.getSettings);
      layer.scene.setPaused(this.paused);
      layer.scene.sync(item.scene ?? []);
      void layer.scene.ready().then(reveal);
      return;
    }

    if (item.type === "effect") {
      layer.effect = new EffectPlayer(el, item.source);
      layer.effect.fps = this.getSettings().fps;
      if (!this.paused) layer.effect.start();
      reveal();
      return;
    }

    const src = resolveSource(this.app, item.source);
    if (item.type === "image") {
      const img = el.createEl("img", { cls: "scenery-media" });
      img.addEventListener("load", reveal, { once: true });
      img.addEventListener("error", fail, { once: true });
      img.src = src;
    } else if (item.type === "video") {
      const video = el.createEl("video", { cls: "scenery-media" });
      layer.video = video;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = !this.paused;
      this.configureVideo(video);
      video.addEventListener("loadeddata", reveal, { once: true });
      video.addEventListener("error", fail, { once: true });
      video.src = src;
    } else {
      const frame = el.createEl("iframe", { cls: "scenery-media" });
      // Scripts may run, but the page gets an opaque origin: no access to the vault or the app.
      frame.setAttribute("sandbox", "allow-scripts");
      frame.addEventListener("load", reveal, { once: true });
      frame.src = src;
    }
  }

  private dispose(layer: Layer) {
    layer.effect?.destroy();
    layer.scene?.destroy();
    if (layer.video) {
      layer.video.pause();
      layer.video.removeAttribute("src");
      layer.video.load();
    }
    layer.el.remove();
  }

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    this.root?.classList.toggle("is-paused", paused);
    const layer = this.current;
    if (!layer) return;
    layer.scene?.setPaused(paused);
    this.post("paused", paused);
    if (paused) {
      layer.video?.pause();
      layer.effect?.stop();
    } else {
      void layer.video?.play().catch(() => undefined);
      layer.effect?.start();
    }
  }

  themeChanged() {
    this.current?.effect?.refreshPalette();
    this.current?.scene?.themeChanged();
    this.post("theme", readTheme(this.doc));
  }

  private applyPointer() {
    const range = this.getSettings().parallax;
    this.root?.style.setProperty("--scenery-px", `${(0.5 - this.pointer.x) * 2 * range}px`);
    this.root?.style.setProperty("--scenery-py", `${(0.5 - this.pointer.y) * 2 * range}px`);
  }

  /** x and y are pointer positions in the 0..1 range. */
  setPointer(x: number, y: number) {
    this.pointer = { x, y };
    this.win.cancelAnimationFrame(this.pointerFrame);
    this.pointerFrame = this.win.requestAnimationFrame(() => {
      this.applyPointer();
      this.post("pointer", this.pointer);
      this.current?.scene?.setPointer(this.pointer);
    });
  }
}
