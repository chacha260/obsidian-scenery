export type WallpaperType = "image" | "video" | "web" | "effect";
export type FitMode = "cover" | "contain" | "fill";

export interface WallpaperItem {
  id: string;
  name: string;
  type: WallpaperType;
  /** Vault path, absolute path, URL, or effect id. */
  source: string;
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
}

export const EFFECT_IDS = ["aurora", "starfield", "particles", "snow"] as const;
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
