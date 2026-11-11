import { t } from "./i18n";
import type { PackageManifest } from "./package";

export function templateManifest(name: string): PackageManifest {
  return {
    name,
    author: "",
    version: "1.0.0",
    description: t("tpl.description"),
    entry: "index.html",
    properties: {
      count: { type: "slider", label: t("tpl.count"), min: 5, max: 200, step: 5, default: 60 },
      speed: { type: "slider", label: t("tpl.speed"), min: 0, max: 3, step: 0.1, default: 1 },
      attraction: { type: "slider", label: t("tpl.attraction"), min: 0, max: 2, step: 0.1, default: 0.6 },
      useAccent: { type: "toggle", label: t("editor.themeColor"), default: true },
      color: { type: "color", label: t("editor.color"), default: "#7fd4ff" },
      shape: { type: "select", label: t("tpl.shape"), options: { glow: t("tpl.shape.glow"), ring: t("tpl.shape.ring") }, default: "glow" },
      trails: { type: "toggle", label: t("tpl.trails"), default: true },
      message: { type: "text", label: t("tpl.message"), default: "" },
    },
    permissions: [],
  };
}

export const TEMPLATE_HTML = String.raw`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; }
  #label { position: fixed; left: 0; right: 0; bottom: 10%; text-align: center; font: 600 28px system-ui, sans-serif; opacity: 0.75; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="label"></div>
<script>
// "scenery" is provided by the Scenery plugin.
//   scenery.on(key, fn) calls fn right away and again whenever the value changes.
//   keys: "props" (values from scenery.json), "theme", "pointer", "paused", "note"
var canvas = document.getElementById("c");
var ctx = canvas.getContext("2d");
var label = document.getElementById("label");
var props = scenery.props;
var theme = scenery.theme;
var pointer = { x: 0.5, y: 0.5 };
var orbs = [];

scenery.on("props", function (p) {
  props = p;
  label.textContent = p.message;
  while (orbs.length > p.count) orbs.pop();
  while (orbs.length < p.count) {
    orbs.push({ x: Math.random(), y: Math.random(), r: 0.008 + Math.random() * 0.03, a: Math.random() * 6.28, v: 0.3 + Math.random() });
  }
});
scenery.on("theme", function (t) {
  theme = t;
  document.body.style.background = t.background;
  label.style.color = t.text;
});
scenery.on("pointer", function (p) { pointer = p; });

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
addEventListener("resize", resize);
resize();

var last = performance.now();
function frame(now) {
  var dt = Math.min(now - last, 100) / 1000;
  last = now;
  var w = canvas.width, h = canvas.height, size = Math.max(w, h);

  // Fading the previous frame instead of clearing it leaves trails.
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = props.trails ? 0.2 : 1;
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = theme.dark ? "lighter" : "source-over";

  var color = props.useAccent ? theme.accent : props.color;
  for (var i = 0; i < orbs.length; i++) {
    var o = orbs[i];
    o.a += (Math.random() - 0.5) * dt * 2;
    // Wander, with a gentle pull toward the pointer.
    o.x += (Math.cos(o.a) * 0.04 * o.v + (pointer.x - o.x) * 0.08 * props.attraction) * props.speed * dt;
    o.y += (Math.sin(o.a) * 0.04 * o.v + (pointer.y - o.y) * 0.08 * props.attraction) * props.speed * dt;
    o.x = (o.x + 1) % 1;
    o.y = (o.y + 1) % 1;
    var x = o.x * w, y = o.y * h, r = o.r * size;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (props.shape === "ring") {
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
    } else {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // No need to check scenery.paused: the plugin holds these callbacks while paused.
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script>
</body>
</html>
`;
