import { App, Notice, Platform, TFile, normalizePath } from "obsidian";
import { EffectPlayer } from "./effects";
import { t } from "./i18n";
import type { ScenerySettings, WallpaperItem } from "./types";

const FADE_MS = 1200;

/** Turn a vault path, absolute path or URL into something an element can load. */
export function resolveSource(app: App, source: string): string {
  if (/^(https?|data|blob|app|file):/i.test(source)) return source;
  const file = app.vault.getAbstractFileByPath(normalizePath(source));
  if (file instanceof TFile) return app.vault.getResourcePath(file);
  if (/^(\/|[A-Za-z]:[\\/])/.test(source)) {
    const path = source.replace(/\\/g, "/").replace(/^\//, "");
    return Platform.resourcePathPrefix + encodeURI(path).replace(/#/g, "%23").replace(/\?/g, "%3F");
  }
  return source;
}

interface Layer {
  el: HTMLElement;
  video?: HTMLVideoElement;
  effect?: EffectPlayer;
}

export class Renderer {
  private root: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private current: Layer | null = null;
  private currentKey = "";
  private token = 0;
  private paused = false;
  private pointerFrame = 0;

  constructor(private app: App, private getSettings: () => ScenerySettings) {}

  mount() {
    if (this.root) return;
    this.root = createDiv({ cls: "scenery-root" });
    this.stage = this.root.createDiv({ cls: "scenery-stage" });
    this.root.createDiv({ cls: "scenery-dim" });
    document.body.prepend(this.root);
    document.body.classList.add("scenery-active");
  }

  unmount() {
    this.token++;
    if (this.current) this.dispose(this.current);
    this.current = null;
    this.currentKey = "";
    this.root?.remove();
    this.root = this.stage = null;
    document.body.classList.remove("scenery-active");
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
    document.body.style.setProperty("--scenery-panel", `${s.panelTint}%`);
    if (s.parallax === 0) this.setPointer(0.5, 0.5);
    const layer = this.current;
    if (layer?.video) this.configureVideo(layer.video);
    if (layer?.effect) layer.effect.fps = s.fps;
  }

  private configureVideo(video: HTMLVideoElement) {
    const s = this.getSettings();
    video.muted = s.volume === 0;
    video.volume = s.volume / 100;
    video.playbackRate = s.playbackRate;
  }

  show(item: WallpaperItem | null) {
    if (!this.stage) return;
    const key = item ? `${item.type}|${item.source}` : "";
    if (key === this.currentKey) return;
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
    const layer = this.current;
    if (!layer) return;
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
  }

  /** x and y are pointer positions in the 0..1 range. */
  setPointer(x: number, y: number) {
    const root = this.root;
    if (!root) return;
    const range = this.getSettings().parallax;
    cancelAnimationFrame(this.pointerFrame);
    this.pointerFrame = requestAnimationFrame(() => {
      root.style.setProperty("--scenery-px", `${(0.5 - x) * 2 * range}px`);
      root.style.setProperty("--scenery-py", `${(0.5 - y) * 2 * range}px`);
    });
  }
}
