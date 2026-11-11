import type { EffectId } from "./types";

type RGB = [number, number, number];

interface Palette {
  bg: RGB;
  accent: RGB;
  dark: boolean;
}

/** Resolve a theme CSS variable to concrete RGB via a throwaway element. */
function resolveColor(cssVar: string, fallback: RGB): RGB {
  const probe = document.body.createDiv();
  probe.style.color = `var(${cssVar})`;
  const m = getComputedStyle(probe).color.match(/[\d.]+/g);
  probe.remove();
  return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : fallback;
}

function readPalette(): Palette {
  return {
    bg: resolveColor("--background-primary", [30, 30, 30]),
    accent: resolveColor("--interactive-accent", [138, 92, 245]),
    dark: document.body.classList.contains("theme-dark"),
  };
}

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Rotate hue of an RGB colour by `deg` degrees. */
function rotateHue([r, g, b]: RGB, deg: number): RGB {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const k = (1 - cos) / 3;
  const s = Math.sqrt(1 / 3) * sin;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return [
    clamp(r * (cos + k) + g * (k - s) + b * (k + s)),
    clamp(r * (k + s) + g * (cos + k) + b * (k - s)),
    clamp(r * (k - s) + g * (k + s) + b * (cos + k)),
  ];
}

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number, p: Palette) => void;

function aurora(): Draw {
  const blobs = Array.from({ length: 6 }, (_, i) => ({
    hue: i * 38 - 70,
    ax: 0.2 + Math.random() * 0.25,
    ay: 0.15 + Math.random() * 0.25,
    sx: 0.03 + Math.random() * 0.05,
    sy: 0.02 + Math.random() * 0.05,
    ph: Math.random() * Math.PI * 2,
    r: 0.35 + Math.random() * 0.3,
  }));
  return (ctx, w, h, time, _dt, p) => {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = rgba(p.bg, 1);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = p.dark ? "lighter" : "multiply";
    const size = Math.max(w, h);
    for (const b of blobs) {
      const x = w * (0.5 + b.ax * 1.6 * Math.sin(time * b.sx * 2 + b.ph));
      const y = h * (0.5 + b.ay * 1.6 * Math.cos(time * b.sy * 2 + b.ph * 1.7));
      const r = size * b.r;
      const col = rotateHue(p.accent, b.hue);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(col, p.dark ? 0.5 : 0.45));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  };
}

function starfield(): Draw {
  const stars = Array.from({ length: 420 }, () => ({
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    z: Math.random(),
    tw: Math.random() * Math.PI * 2,
  }));
  return (ctx, w, h, time, dt, p) => {
    ctx.fillStyle = rgba(p.bg, 1);
    ctx.fillRect(0, 0, w, h);
    const fg: RGB = p.dark ? [255, 255, 255] : p.accent;
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.max(w, h) * 0.6;
    for (const s of stars) {
      s.z -= dt * 0.035;
      if (s.z <= 0.02) {
        s.x = Math.random() * 2 - 1;
        s.y = Math.random() * 2 - 1;
        s.z = 1;
      }
      const px = cx + (s.x / s.z) * scale * 0.5;
      const py = cy + (s.y / s.z) * scale * 0.5;
      if (px < 0 || px > w || py < 0 || py > h) continue;
      const depth = 1 - s.z;
      const alpha = (0.25 + 0.75 * depth) * (0.75 + 0.25 * Math.sin(time * 2 + s.tw));
      ctx.fillStyle = rgba(depth > 0.8 ? p.accent : fg, alpha);
      ctx.beginPath();
      ctx.arc(px, py, 0.7 + depth * 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}

function particles(): Draw {
  const pts = Array.from({ length: 90 }, () => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * 0.02,
    vy: (Math.random() - 0.5) * 0.02,
  }));
  return (ctx, w, h, _time, dt, p) => {
    ctx.fillStyle = rgba(p.bg, 1);
    ctx.fillRect(0, 0, w, h);
    const link = Math.max(w, h) * 0.11;
    for (const a of pts) {
      a.x = (a.x + a.vx * dt + 1) % 1;
      a.y = (a.y + a.vy * dt + 1) % 1;
    }
    ctx.lineWidth = 1.5;
    for (let i = 0; i < pts.length; i++) {
      const ax = pts[i].x * w;
      const ay = pts[i].y * h;
      for (let j = i + 1; j < pts.length; j++) {
        const dx = ax - pts[j].x * w;
        const dy = ay - pts[j].y * h;
        const d = Math.hypot(dx, dy);
        if (d > link) continue;
        ctx.strokeStyle = rgba(p.accent, (1 - d / link) * 0.8);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(pts[j].x * w, pts[j].y * h);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(p.accent, 1);
      ctx.beginPath();
      ctx.arc(ax, ay, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}

function snow(): Draw {
  const flakes = Array.from({ length: 220 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.6 + Math.random() * 2.4,
    v: 0.02 + Math.random() * 0.05,
    sway: Math.random() * Math.PI * 2,
  }));
  return (ctx, w, h, time, dt, p) => {
    const top = rotateHue(p.accent, -20);
    ctx.fillStyle = rgba(p.bg, 1);
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createLinearGradient(0, 0, 0, h);
    glow.addColorStop(0, rgba(top, 0.28));
    glow.addColorStop(1, rgba(top, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    const fg: RGB = p.dark ? [255, 255, 255] : p.accent;
    for (const f of flakes) {
      f.y += f.v * dt * (0.6 + f.r / 3);
      if (f.y > 1.02) {
        f.y = -0.02;
        f.x = Math.random();
      }
      const x = (f.x + Math.sin(time * 0.6 + f.sway) * 0.012) * w;
      ctx.fillStyle = rgba(fg, 0.25 + f.r / 4.5);
      ctx.beginPath();
      ctx.arc(x, f.y * h, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}

const FACTORIES: Record<EffectId, () => Draw> = { aurora, starfield, particles, snow };

export class EffectPlayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private draw: Draw;
  private palette = readPalette();
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;
  private observer: ResizeObserver;
  fps = 30;

  constructor(parent: HTMLElement, id: string) {
    this.canvas = parent.createEl("canvas", { cls: "scenery-media" });
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    this.draw = (FACTORIES[id as EffectId] ?? aurora)();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.canvas);
    this.resize();
  }

  private resize() {
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.render(0);
    }
  }

  /** Re-read theme colours (call when the theme changes). */
  refreshPalette() {
    this.palette = readPalette();
    this.render(0);
  }

  private render(dt: number) {
    this.time += dt;
    this.draw(this.ctx, this.canvas.width, this.canvas.height, this.time, dt, this.palette);
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const elapsed = now - this.last;
    if (elapsed < 1000 / this.fps - 2) return;
    this.last = now;
    this.render(Math.min(elapsed, 100) / 1000);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.observer.disconnect();
  }
}
