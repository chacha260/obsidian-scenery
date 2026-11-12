export type WallpaperType = "image" | "video" | "web" | "effect" | "scene" | "package";
export type FitMode = "cover" | "contain" | "fill";

export interface WallpaperItem {
  id: string;
  name: string;
  type: WallpaperType;
  /** Vault path, absolute path, URL, effect id, or package folder. Empty for scenes. */
  source: string;
  /** Layers of a scene, bottom first. */
  scene?: SceneLayer[];
  /** Packages: values the user chose for the properties declared in scenery.json. */
  values?: Record<string, unknown>;
  /** Packages: the user allowed this wallpaper to learn which note is open. */
  allowNote?: boolean;
}

export type LayerKind = "image" | "video" | "effect" | "color" | "package";
export const BLEND_MODES = [
  "normal", "screen", "lighten", "color-dodge", "multiply", "darken", "overlay", "soft-light", "hard-light", "difference", "hue", "color", "luminosity",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];
export const MOTIONS = ["none", "sway-x", "sway-y", "drift", "zoom", "rotate", "pulse"] as const;
export type Motion = (typeof MOTIONS)[number];

export interface SceneLayer {
  id: string;
  name: string;
  kind: LayerKind;
  /** Image/video: vault path, absolute path or URL. Effect: effect id. Package: vault folder. */
  source: string;
  /** Package layers: values for the properties the package declares. */
  values?: Record<string, unknown>;
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  blur: number;
  fit: FitMode;
  /** Percent. */
  scale: number;
  /** Offset in percent of the window. */
  x: number;
  y: number;
  motion: Motion;
  /** 0-100: how far the motion goes. */
  amount: number;
  /** Seconds for one motion cycle. */
  period: number;
  /** Extra mouse parallax in percent of the global setting. Negative moves the other way. */
  depth: number;
  /** Colour layers: fill colour. Effect layers: tint when themeColor is off. */
  color: string;
  color2: string;
  gradient: boolean;
  angle: number;
  themeColor: boolean;
}

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function newLayer(kind: LayerKind, name: string, patch: Partial<SceneLayer> = {}): SceneLayer {
  return {
    id: uid(),
    name,
    kind,
    source: kind === "effect" ? "fireflies" : "",
    visible: true,
    opacity: 100,
    blend: "normal",
    blur: 0,
    fit: "cover",
    scale: 100,
    x: 0,
    y: 0,
    motion: "none",
    amount: 30,
    period: 20,
    depth: 0,
    color: kind === "effect" ? "#ffd27a" : "#141a33",
    color2: "#53245f",
    gradient: true,
    angle: 160,
    themeColor: kind === "effect",
    ...patch,
  };
}

export interface ScenerySettings {
  enabled: boolean;
  items: WallpaperItem[];
  activeId: string | null;
  fit: FitMode;
  /** 0-100: how strongly the theme background colour covers the wallpaper. */
  dim: number;
  /** 0-100: extra tint on sidebars and ribbon. */
  panelTint: number;
  blur: number;
  brightness: number;
  saturation: number;
  parallax: number;
  volume: number;
  playbackRate: number;
  pauseOnBlur: boolean;
  fps: number;
  slideshow: boolean;
  intervalMinutes: number;
  shuffle: boolean;
  /** Vault folder where new wallpaper packages are created. */
  packageFolder: string;
}

export const EFFECT_IDS = ["aurora", "starfield", "particles", "snow", "fireflies", "rain"] as const;
export type EffectId = (typeof EFFECT_IDS)[number];

export const DEFAULT_SETTINGS: ScenerySettings = {
  enabled: true,
  items: EFFECT_IDS.map((id) => ({
    id: `effect-${id}`,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    type: "effect" as const,
    source: id,
  })),
  activeId: "effect-aurora",
  fit: "cover",
  dim: 55,
  panelTint: 25,
  blur: 0,
  brightness: 100,
  saturation: 100,
  parallax: 0,
  volume: 0,
  playbackRate: 1,
  pauseOnBlur: true,
  fps: 30,
  slideshow: false,
  intervalMinutes: 10,
  shuffle: false,
  packageFolder: "Scenery",
};

export const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg"];
export const VIDEO_EXT = ["mp4", "webm", "mkv", "mov", "ogv", "m4v"];
export const WEB_EXT = ["html", "htm"];

export function detectType(source: string): WallpaperType | null {
  const ext = source.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (WEB_EXT.includes(ext)) return "web";
  return null;
}
