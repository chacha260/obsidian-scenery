import type { App } from "obsidian";
import { EffectPlayer } from "./effects";
import { resolveSource } from "./source";
import type { SceneLayer, ScenerySettings } from "./types";

interface Handle {
  key: string;
  outer: HTMLElement;
  parallax: HTMLElement;
  motion: HTMLElement;
  media: HTMLElement;
  video?: HTMLVideoElement;
  effect?: EffectPlayer;
  loaded: Promise<void>;
}

const LOAD_TIMEOUT_MS = 4000;

/** Renders the layers of a scene into one element and keeps them in sync with edits. */
export class SceneRuntime {
  private handles = new Map<string, Handle>();
  private root: HTMLElement;
  private paused = false;

  constructor(private app: App, parent: HTMLElement, private getSettings: () => ScenerySettings) {
    this.root = parent.createDiv({ cls: "scenery-scene" });
  }

  /**
   * Bring the DOM in line with `layers`. Media is only (re)loaded for layers whose
   * kind or source changed, so dragging a slider never restarts a video.
   */
  sync(layers: SceneLayer[]) {
    const next = new Map<string, Handle>();
    layers.forEach((layer, index) => {
      const key = `${layer.id}|${layer.kind}|${layer.kind === "color" ? "" : layer.source}`;
      let handle = this.handles.get(layer.id);
      if (handle && handle.key !== key) {
        this.dispose(handle);
        handle = undefined;
      }
      handle ??= this.create(layer, key);
      next.set(layer.id, handle);
      this.style(handle, layer, index);
    });
    for (const [id, handle] of this.handles) if (!next.has(id)) this.dispose(handle);
    this.handles = next;
    this.applySettings();
  }

  /** Resolves once every layer has loaded (or failed, or taken too long). */
  ready(): Promise<void> {
    const all = Promise.all([...this.handles.values()].map((h) => h.loaded)).then(() => undefined);
    return Promise.race([all, new Promise<void>((r) => window.setTimeout(r, LOAD_TIMEOUT_MS))]);
  }

  private create(layer: SceneLayer, key: string): Handle {
    const outer = this.root.createDiv({ cls: "scenery-sl" });
    const parallax = outer.createDiv({ cls: "scenery-sl-parallax" });
    const motion = parallax.createDiv({ cls: "scenery-sl-motion" });
    const handle: Handle = { key, outer, parallax, motion, media: motion, loaded: Promise.resolve() };

    const whenLoaded = (el: HTMLElement, event: string) =>
      new Promise<void>((resolve) => {
        el.addEventListener(event, () => resolve(), { once: true });
        el.addEventListener(
          "error",
          () => {
            // A broken layer should not take the rest of the scene down with it.
            el.classList.add("is-broken");
            resolve();
          },
          { once: true }
        );
      });

    if (layer.kind === "color") {
      handle.media = motion.createDiv({ cls: "scenery-media" });
    } else if (layer.kind === "effect") {
      handle.effect = new EffectPlayer(motion, layer.source, { transparent: true });
      handle.media = handle.effect.canvas;
      if (!this.paused) handle.effect.start();
    } else if (!layer.source) {
      handle.media = motion.createDiv({ cls: "scenery-media" });
    } else if (layer.kind === "image") {
      const img = motion.createEl("img", { cls: "scenery-media" });
      handle.media = img;
      handle.loaded = whenLoaded(img, "load");
      img.src = resolveSource(this.app, layer.source);
    } else {
      const video = motion.createEl("video", { cls: "scenery-media" });
      handle.media = handle.video = video;
      video.loop = true;
      video.playsInline = true;
      video.muted = true;
      video.autoplay = !this.paused;
      handle.loaded = whenLoaded(video, "loadeddata");
      video.src = resolveSource(this.app, layer.source);
    }
    return handle;
  }

  private style(h: Handle, l: SceneLayer, index: number) {
    h.outer.style.zIndex = String(index);
    h.outer.style.display = l.visible ? "" : "none";
    h.outer.style.opacity = String(l.opacity / 100);
    h.outer.style.mixBlendMode = l.blend;
    h.outer.style.filter = l.blur > 0 ? `blur(${l.blur}px)` : "";
    h.parallax.style.setProperty("--scenery-depth", String(l.depth / 100));
    h.motion.dataset.motion = l.motion;
    h.motion.style.setProperty("--scenery-amt", String(l.amount / 100));
    h.motion.style.animationDuration = `${Math.max(0.5, l.period)}s`;
    h.media.style.transform = `translate(${l.x}%, ${l.y}%) scale(${l.scale / 100})`;
    h.media.style.objectFit = l.fit;
    if (l.kind === "color") {
      h.media.style.background = l.gradient ? `linear-gradient(${l.angle}deg, ${l.color}, ${l.color2})` : l.color;
    }
    h.effect?.setTint(l.themeColor ? null : l.color);
  }

  /** Volume, speed and frame rate come from the plugin settings, not from the scene. */
  applySettings() {
    const s = this.getSettings();
    for (const h of this.handles.values()) {
      if (h.video) {
        h.video.muted = s.volume === 0;
        h.video.volume = s.volume / 100;
        h.video.playbackRate = s.playbackRate;
      }
      if (h.effect) h.effect.fps = s.fps;
    }
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    for (const h of this.handles.values()) {
      if (paused) {
        h.video?.pause();
        h.effect?.stop();
      } else {
        void h.video?.play().catch(() => undefined);
        h.effect?.start();
      }
    }
  }

  themeChanged() {
    for (const h of this.handles.values()) h.effect?.refreshPalette();
  }

  private dispose(h: Handle) {
    h.effect?.destroy();
    if (h.video) {
      h.video.pause();
      h.video.removeAttribute("src");
      h.video.load();
    }
    h.outer.remove();
  }

  destroy() {
    for (const h of this.handles.values()) this.dispose(h);
    this.handles.clear();
    this.root.remove();
  }
}
