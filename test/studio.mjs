// Checks for the Studio web app (studio/), run in headless Chromium.
//   node test/studio.mjs [--shots]
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const dist = path.join(root, "studio/dist");
const tmp = path.join(here, ".tmp");
const shots = process.argv.includes("--shots");

execFileSync(process.execPath, [path.join(root, "studio/build.mjs")], { stdio: "inherit" });
await fs.mkdir(tmp, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webm": "video/webm" };
const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const file = url.startsWith("/fixtures/") ? path.join(here, url) : path.join(dist, url === "/" ? "index.html" : url);
  try {
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(await fs.readFile(file));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        got: ${JSON.stringify(detail)}`}`);
}
const section = (name) => console.log(`\n${name}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 820 }, locale: "en-US" });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
await page.goto(`http://localhost:${server.address().port}/`);
const run = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(tmp, `studio-${name}.png`) }); };
const frame = () => page.frames().find((f) => f !== page.mainFrame() && !f.isDetached());

// ---------------------------------------------------------------------------
section("Studio: scenes");
await wait(500);
check("starts with a three-layer scene on the stage", (await run(() => document.querySelectorAll(".stage .scenery-sl").length)) === 3 && (await page.locator(".layer-row").count()) === 3);
const stageBox = await page.locator(".stage").boundingBox();
check("the stage keeps a 16:9 frame", Math.abs(stageBox.width / stageBox.height - 16 / 9) < 0.02, stageBox);

await run(async () => { const blob = await (await fetch("/fixtures/media/photo.png")).blob(); studio.modes.scene.addFiles([new File([blob], "photo.png", { type: "image/png" })]); });
await wait(600);
check("a dropped image becomes a selected layer", (await run(() => document.querySelector(".stage .scenery-sl img")?.naturalWidth)) === 320 && (await page.locator(".layer-row.is-selected").count()) === 1);

await page.mouse.move(stageBox.x + 200, stageBox.y + 200); await page.mouse.down();
await page.mouse.move(stageBox.x + 200 + stageBox.width * 0.1, stageBox.y + 200 + stageBox.height * 0.05, { steps: 5 }); await page.mouse.up(); await wait(100);
const moved = await run(() => { const l = studio.modes.scene.layers.at(-1); return { x: l.x, y: l.y }; });
check("dragging on the stage moves the selected layer", Math.abs(moved.x - 10) < 1 && Math.abs(moved.y - 5) < 1, moved);
check("the layer's frame is outlined and the sliders follow", (await run(() => !document.querySelector(".stage-outline").hidden)) && (await page.locator(".layer-props .readout").allTextContents()).includes(String(moved.x)));
await page.mouse.wheel(0, -100); await wait(100);
check("scrolling on the stage resizes the layer", (await run(() => studio.modes.scene.layers.at(-1).scale)) === 102);

await page.locator(".layer-props select").nth(1).selectOption("screen"); // blend mode (fit is the first select)
await page.locator(".layer-props input[type=range]").first().evaluate((el) => { el.value = 50; el.dispatchEvent(new Event("input")); });
const styled = await run(() => { const sl = [...document.querySelectorAll(".stage .scenery-sl")].find((e) => e.querySelector("img")); return { blend: sl.style.mixBlendMode, opacity: sl.style.opacity }; });
check("panel controls apply to the preview", styled.blend === "screen" && styled.opacity === "0.5", styled);
await shot("scene");

const exported = await run(async () => { const files = studio.modes.scene.files(); return { paths: [...files.keys()], manifest: JSON.parse(await files.get("scenery.json").text()) }; });
const sources = exported.manifest.layers.map((l) => `${l.kind}:${l.source}`);
check("export is a scene manifest with relative paths plus the files used", exported.manifest.type === "scene" && sources.includes("image:./assets/photo.png") && exported.paths.includes("assets/photo.png"), { sources, paths: exported.paths });

const zipBytes = await run(async () => { const files = new Map([...studio.modes.scene.files()].map(([p, b]) => ["Scene/" + p, b])); return Array.from(new Uint8Array(await (await studio.zip(files)).arrayBuffer())); });
const zipPath = path.join(tmp, "studio-scene.zip");
await fs.writeFile(zipPath, Buffer.from(zipBytes));
let listing = "";
try { listing = execFileSync("unzip", ["-t", zipPath], { encoding: "utf8" }); } catch (e) { listing = String(e.stdout ?? e); }
check("the .zip is a valid archive containing the folder", /No errors detected/.test(listing) && listing.includes("Scene/scenery.json") && listing.includes("Scene/assets/photo.png"), listing.slice(0, 300));

await run(async () => { const scene = studio.modes.scene; const files = scene.files(); const manifest = JSON.parse(await files.get("scenery.json").text()); scene.layers = []; scene.load(manifest, files); studio.switchTo("scene"); });
await wait(600);
const reopened = await run(() => ({ layers: studio.modes.scene.layers.map((l) => `${l.kind}:${l.source}`), img: document.querySelector(".stage .scenery-sl img")?.naturalWidth, blend: studio.modes.scene.layers.at(-1).blend }));
check("an exported scene opens again unchanged", reopened.layers.includes("image:assets/photo.png") && reopened.img === 320 && reopened.blend === "screen", reopened);

// ---------------------------------------------------------------------------
section("Studio: packages");
await page.click(".bar .tabs button:nth-child(2)"); await wait(1200);
const api = await frame().evaluate(() => ({ count: scenery.props.count, orbs: orbs.length, dark: scenery.theme.dark }));
check("the starter package runs with window.scenery", api.count === 60 && api.orbs === 60 && api.dark === true, api);
check("settings preview lists the declared properties", (await page.locator(".controls .field").count()) === 8);
await page.locator(".controls input[type=range]").first().evaluate((el) => { el.value = 20; el.dispatchEvent(new Event("input")); }); await wait(200);
check("changing a setting updates the running page", (await frame().evaluate(() => orbs.length)) === 20);

await page.locator(".bar .view input[type=checkbox]").first().uncheck(); await wait(200);
check("the theme switch reaches the page", (await frame().evaluate(() => scenery.theme.dark)) === false && (await run(() => document.body.classList.contains("theme-light"))));
await page.locator(".bar .view input[type=checkbox]").nth(2).check(); await wait(300);
const p1 = await frame().evaluate(() => last); await wait(300); const p2 = await frame().evaluate(() => last);
check("pause holds the page's animation", p1 === p2 && (await frame().evaluate(() => scenery.paused)));
await page.locator(".bar .view input[type=checkbox]").nth(2).uncheck();

const code = page.locator("textarea.code");
await code.evaluate((el) => { el.value = el.value.replace('<div id="label"></div>', '<div id="label" data-edited="yes"></div>'); el.dispatchEvent(new Event("input")); }); await wait(1500);
check("editing index.html reloads the preview and keeps the values", (await frame().evaluate(() => document.getElementById("label").dataset.edited)) === "yes" && (await frame().evaluate(() => scenery.props.count)) === 20);
await page.click(".panel .tabs button:nth-child(2)");
await code.evaluate((el) => { el.dataset.good = el.value; el.value = "{ not json"; el.dispatchEvent(new Event("input")); }); await wait(900);
check("invalid JSON shows an error and keeps the last working page", (await page.locator(".error").textContent()).includes("scenery.json") && (await frame().evaluate(() => orbs.length)) === 20);
await code.evaluate((el) => { const m = JSON.parse(el.dataset.good); m.properties.extra = { type: "toggle", label: "Extra", default: true }; el.value = JSON.stringify(m, null, 2); el.dispatchEvent(new Event("input")); }); await wait(1500);
check("a property added to scenery.json appears in the preview", (await page.locator(".controls .field").count()) === 9 && (await frame().evaluate(() => scenery.props.extra)) === true && (await page.locator(".error").textContent()) === "");
const pkgFiles = await run(async () => { const files = studio.modes.package.files(); return { paths: [...files.keys()].sort(), edited: (await files.get("index.html").text()).includes("data-edited") }; });
check("the package exports scenery.json and index.html as edited", JSON.stringify(pkgFiles.paths) === JSON.stringify(["index.html", "scenery.json"]) && pkgFiles.edited, pkgFiles);
await shot("package");

section("Page errors");
check("no uncaught errors in the page", pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
