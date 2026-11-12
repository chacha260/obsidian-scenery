// Builds the Studio into studio/dist: a static site that can be opened from disk or hosted anywhere.
//   node studio/build.mjs          build once
//   node studio/build.mjs --serve  build, rebuild on change, and serve on http://localhost:4173
import esbuild from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "dist");
const serve = process.argv.includes("--serve");

await mkdir(out, { recursive: true });
await copyFile(path.join(here, "index.html"), path.join(out, "index.html"));
await copyFile(path.join(here, "studio.css"), path.join(out, "studio.css"));
await copyFile(path.join(here, "..", "styles.css"), path.join(out, "plugin.css"));

const ctx = await esbuild.context({
  entryPoints: [path.join(here, "main.ts")],
  bundle: true,
  // The shared plugin code imports "obsidian"; in the browser that is the small shim.
  alias: { obsidian: path.join(here, "obsidian-shim.ts") },
  format: "iife",
  target: "es2020",
  minify: !serve,
  sourcemap: serve ? "inline" : false,
  outfile: path.join(out, "studio.js"),
  logLevel: "info",
});

if (serve) {
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: out, port: 4173 });
  console.log(`Scenery Studio: http://localhost:${port}`);
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
