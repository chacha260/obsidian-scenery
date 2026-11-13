// End-to-end checks for the plugin, run in headless Chromium against a stubbed Obsidian API.
//   npm test            run all checks
//   npm test -- --shots also save screenshots to test/.tmp/
// The stub lives in test/harness/stub.js; it imitates Obsidian, it is not Obsidian. These
// checks cover the plugin's own logic, not how the real app lays things out.
import { build } from "esbuild";
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const tmp = path.join(here, ".tmp");
const shots = process.argv.includes("--shots");

await fs.mkdir(tmp, { recursive: true });
await build({
  entryPoints: [path.join(here, "harness/entry.js")],
  bundle: true,
  alias: { obsidian: path.join(here, "harness/stub.js") },
  outfile: path.join(tmp, "bundle.js"),
  logLevel: "warning",
});

const POPOUT = `<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><style>html,body{margin:0;height:100%}body{--background-primary:#1e1e1e;--background-secondary:#262626;--interactive-accent:#8a5cf5;background:var(--background-primary)}.app-container{height:100%;background:var(--background-primary)}</style></head><body class="theme-dark"><div class="app-container"></div></body></html>`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webm": "video/webm", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/popout.html") return res.writeHead(200, { "content-type": "text/html" }).end(POPOUT);
  const file =
    url === "/" ? path.join(here, "harness/index.html")
    : url === "/bundle.js" ? path.join(tmp, "bundle.js")
    : url === "/styles.css" ? path.join(root, "styles.css")
    : url.startsWith("/fixtures/") ? path.join(here, url)
    : null;
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(data);
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
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
await page.goto(`http://localhost:${server.address().port}/`);
await page.evaluate(() => window.ready);

const run = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(tmp, `${name}.png`) }); };
/** Sandboxed wallpaper frames currently attached to the main page. */
const frames = () => page.frames().filter((f) => f !== page.mainFrame() && !f.isDetached() && f.url() === "about:srcdoc");
const openSettings = async () => { await run(() => { document.querySelector("#panel").replaceChildren(__tab.containerEl); __tab.display(); }); await wait(400); };
const setPaused = (paused) => run((p) => plugin.setPaused(p), paused);
const visibleLayers = () => run(() => document.querySelectorAll(".scenery-layer.is-visible").length);

await run(() => { plugin.settings.pauseOnBlur = false; plugin.settings.dim = 25; plugin.refresh(); });

// ---------------------------------------------------------------------------
section("Basics");
await wait(300);
check("default effect is shown", await run(() => !!document.querySelector(".scenery-root canvas")));
check("workspace is transparent while the wallpaper layer exists", (await run(() => getComputedStyle(document.querySelector(".app-container")).backgroundColor)) === "rgba(0, 0, 0, 0)");
// Obsidian copies <body> classes to its settings and pop-out windows. The switch must not live there,
// or those windows would go transparent with nothing behind them (the black title bar bug).
check("nothing is added to <body> that Obsidian would copy to other windows", await run(() => ![...document.body.classList].some((c) => c.startsWith("scenery"))));
check("the stylesheet does not use :has()", !(await fs.readFile(path.join(root, "styles.css"), "utf8")).includes(":has("));

await run(() => plugin.setActive(plugin.addItems(["media/photo.png"])[0])); await wait(1600);
check("image wallpaper loads", (await run(() => document.querySelector(".scenery-layer.is-visible img")?.naturalWidth)) === 320);
await run(() => plugin.setActive(plugin.addItems(["media/clip.webm"])[0])); await wait(1800);
const video = await run(() => { const v = document.querySelector(".scenery-layer.is-visible video"); return v && { playing: !v.paused && v.currentTime > 0, muted: v.muted }; });
check("video wallpaper plays muted", video?.playing && video.muted, video);
check("old layers are removed after the cross-fade", (await run(() => document.querySelectorAll(".scenery-layer").length)) === 1);
await run(() => plugin.setActive(plugin.addItems([location.origin + "/missing.png"], "image")[0])); await wait(800);
check("a wallpaper that fails to load leaves the previous one up", (await visibleLayers()) === 1 && (await run(() => __notices.some((n) => n.includes("missing.png")))));
await run(() => { plugin.settings.parallax = 20; plugin.applyStyle(); }); await page.mouse.move(1050, 400); await wait(100);
check("parallax follows the pointer", (await run(() => document.querySelector(".scenery-root").style.getPropertyValue("--scenery-px"))) === "-10px");
await run(() => plugin.toggle());
check("turning the wallpaper off cleans up", await run(() => !document.querySelector(".scenery-root") && !document.documentElement.classList.contains("scenery-on")));
await run(() => plugin.toggle());

// ---------------------------------------------------------------------------
section("Scenes");
await run(() => plugin.createScene()); await wait(500);
check("new scene has three layers and opens the editor", (await run(() => document.querySelectorAll(".scenery-sl").length)) === 3 && (await page.locator(".scenery-layer-row").count()) === 3);
await page.click("text=Add layer"); await run(() => __menu.items[0].click());
const source = page.locator('.scenery-layer-props input[placeholder="wallpapers/…"]');
await source.fill("media/photo.png"); await source.dispatchEvent("change"); await wait(500);
check("image layer added through the editor loads", (await run(() => document.querySelector(".scenery-sl img")?.naturalWidth)) === 320);
await run(() => { document.querySelector(".scenery-sl canvas").dataset.mark = "1"; });
await page.locator(".scenery-layer-props input[type=range]").first().evaluate((el) => { el.value = 60; el.dispatchEvent(new Event("input")); });
await page.locator(".scenery-layer-props select").nth(1).selectOption("overlay");
await page.locator(".scenery-layer-props select").nth(2).selectOption("zoom");
const styled = await run(() => { const sl = [...document.querySelectorAll(".scenery-sl")].find((e) => e.querySelector("img")); const m = sl.querySelector(".scenery-sl-motion"); return { opacity: sl.style.opacity, blend: sl.style.mixBlendMode, anim: getComputedStyle(m).animationName }; });
check("slider, blend mode and motion apply live", styled.opacity === "0.6" && styled.blend === "overlay" && styled.anim === "scenery-zoom", styled);
check("editing one layer does not rebuild the others", await run(() => !!document.querySelector(".scenery-sl canvas[data-mark]")));
const before = await run(() => plugin.activeItem.scene.map((l) => l.kind));
await run(() => { const rows = document.querySelectorAll(".scenery-layer-row"); const dt = new DataTransfer(); rows[0].dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true })); rows[3].dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true })); rows[3].dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); });
const after = await run(() => plugin.activeItem.scene.map((l) => l.kind));
check("dragging a layer row reorders the layers", before.at(-1) === "image" && after[0] === "image" && after.length === 4, { before, after });
check("layer order is reflected in z-index", (await run(() => [...document.querySelectorAll(".scenery-sl")].find((e) => e.querySelector("img")).style.zIndex)) === "0");
await page.locator(".scenery-editor input[type=checkbox]").first().check(); await wait(600);
check("preview toggle lifts the dimming", (await run(() => getComputedStyle(document.querySelector(".scenery-dim")).opacity)) === "0");
await page.locator(".scenery-editor input[type=checkbox]").first().uncheck();
await shot("scene");

// ---------------------------------------------------------------------------
section("Packages");
const folder = await run(() => plugin.createPackage("My: Wall/paper")); await wait(1500);
check("template package is created with a safe folder name", folder === "Scenery/My- Wall-paper", folder);
const api = await frames()[0].evaluate(() => ({ count: scenery.props.count, orbs: orbs.length, accent: scenery.theme.accent, paused: scenery.paused }));
check("page receives props and theme through window.scenery", api.count === 60 && api.orbs === 60 && /^rgb/.test(api.accent), api);
check("page cannot reach the app", await frames()[0].evaluate(() => { try { return !parent.document; } catch { return true; } }));
await openSettings();
const props = page.locator("#panel > div > div").filter({ hasText: "Number of orbs" });
// Heading, the package's description line, then the eight declared properties.
check("settings show one control per declared property", (await props.locator(".setting-item").count()) === 10);
await props.locator("input[type=range]").first().evaluate((el) => { el.value = 15; el.dispatchEvent(new Event("input")); });
await props.locator("select").selectOption("ring"); await props.locator("input[type=text]").fill("Hello"); await wait(200);
const edited = await frames()[0].evaluate(() => ({ orbs: orbs.length, shape: props.shape, label: document.getElementById("label").textContent }));
check("changing a control updates the running page", edited.orbs === 15 && edited.shape === "ring" && edited.label === "Hello", edited);
await setPaused(true); await wait(250);
const f1 = await frames()[0].evaluate(() => last); await wait(400); const f2 = await frames()[0].evaluate(() => last);
await setPaused(false); await wait(400);
check("pausing holds requestAnimationFrame; resuming releases it", f1 === f2 && (await frames()[0].evaluate(() => last)) > f2);
await run(() => { const k = [...__mem.keys()].find((k) => k.endsWith("index.html")); __mem.set(k, __mem.get(k).replace('<div id="label">', '<div id="label" data-v="2">')); __vaultOn.modify.forEach((f) => f({ path: k })); }); await wait(2200);
const reloaded = await frames()[0].evaluate(() => ({ v: document.getElementById("label").dataset.v, count: scenery.props.count }));
check("saving a package file reloads it and keeps the chosen values", reloaded.v === "2" && reloaded.count === 15, reloaded);
await shot("package");

await run(() => plugin.setActive(plugin.addItems(["ext"], "package", "Ext")[0])); await wait(1500);
const ext1 = await frames()[0].evaluate(() => document.getElementById("o").textContent);
check("relative scripts load; note is withheld by default", ext1.includes("external script ok") && ext1.includes("note=null"), ext1);
await run(async () => { const item = plugin.activeItem; item.allowNote = true; item.values = { size: 99, mode: "zzz" }; plugin.packageChanged(item, JSON.parse(await __app.vault.adapter.read("ext/scenery.json"))); }); await wait(200);
const ext2 = await frames()[0].evaluate(() => document.getElementById("o").textContent);
check("note is shared once allowed; out-of-range values are corrected", ext2.includes("size=9 mode=a") && ext2.includes('"name":"Welcome"'), ext2);
await run(() => { __mem.set("bad/scenery.json", "{ nope"); return plugin.setActive(plugin.addItems(["bad"], "package", "Bad")[0]); }); await wait(800);
check("a broken manifest leaves the previous wallpaper up", (await visibleLayers()) === 1);

// ---------------------------------------------------------------------------
section("Packages as scene layers, export and import");
await run(() => {
  __mem.set("pk/overlay/scenery.json", JSON.stringify({ name: "Overlay", properties: { n: { type: "slider", min: 1, max: 9, default: 3 } } }));
  __mem.set("pk/overlay/index.html", '<html><body style="margin:0"><h1 id="o"></h1><script>window.ticks=0;(function t(){window.ticks++;requestAnimationFrame(t)})();scenery.on("props",function(p){document.getElementById("o").textContent="overlay n="+p.n});</scr' + 'ipt></body></html>');
  const scene = plugin.settings.items.find((i) => i.type === "scene");
  return plugin.openEditor(scene.id);
});
await page.click("text=Add layer"); await run(() => __menu.items[4].click());
const pkgSource = page.locator('.scenery-layer-props input[placeholder="Scenery/…"]');
await pkgSource.fill("pk/overlay"); await pkgSource.dispatchEvent("change"); await wait(1200);
check("package layer runs inside the scene", (await frames()[0].evaluate(() => document.getElementById("o").textContent)) === "overlay n=3");
await page.locator(".scenery-layer-props input[type=range]").first().evaluate((el) => { el.value = 7; el.dispatchEvent(new Event("input")); }); await wait(200);
check("its properties are editable per layer without a reload", (await frames()[0].evaluate(() => document.getElementById("o").textContent)) === "overlay n=7" && frames().length === 1);
await setPaused(true); await wait(200); const k1 = await frames()[0].evaluate(() => ticks); await wait(300); const k2 = await frames()[0].evaluate(() => ticks); await setPaused(false);
check("package layers pause with the scene", k1 === k2);

const exported = await run(() => plugin.exportScene(plugin.activeItem.id));
const manifest = JSON.parse(await run(() => __mem.get("Scenery/Scene 1/scenery.json")));
const sources = manifest.layers.map((l) => `${l.kind}:${l.source}`);
check("export writes a scene manifest with relative paths", exported === "Scenery/Scene 1" && manifest.type === "scene" && sources.includes("image:./assets/photo.png") && sources.includes("package:./packages/overlay"), sources);
check("export copies the files it references", await run(() => __alias.has("Scenery/Scene 1/assets/photo.png") && __mem.has("Scenery/Scene 1/packages/overlay/index.html")));
check("export refuses to overwrite a folder that is not an exported scene", (await run(async () => { __mem.set("Scenery/Other/scenery.json", '{"name":"x"}'); plugin.settings.items.push({ id: "zz", name: "Other", type: "scene", source: "", scene: [] }); const r = await plugin.exportScene("zz"); plugin.settings.items.pop(); return r; })) === null);
const imported = await run(async () => { const layers = await importSceneFrom("Scenery/Scene 1"); plugin.settings.items.push({ id: "imp", name: "Imported", type: "scene", source: "", scene: layers }); await plugin.setActive("imp"); return layers.map((l) => `${l.kind}:${l.source}`); });
await wait(1800);
check("import resolves paths against the folder", imported.includes("image:Scenery/Scene 1/assets/photo.png") && imported.includes("package:Scenery/Scene 1/packages/overlay"), imported);
check("imported scene renders its image and package", (await run(() => document.querySelector(".scenery-layer.is-visible .scenery-sl img")?.naturalWidth)) === 320 && (await frames()[0].evaluate(() => document.getElementById("o").textContent)) === "overlay n=7");

// ---------------------------------------------------------------------------
section("Wallpaper Engine web wallpapers");
await run(() => {
  __mem.set("we/demo/project.json", JSON.stringify({ title: "WE Demo", type: "web", file: "main.html", general: { properties: {
    schemecolor: { order: 0, text: "ui_browse_properties_scheme_color", type: "color", value: "0.2 0.4 1" },
    speed: { order: 2, text: "<b>Speed</b>", type: "slider", min: 0, max: 10, value: 4 },
    mode: { order: 1, text: "Mode", type: "combo", value: "b", options: [{ label: "Alpha", value: "a" }, { label: "Beta", value: "b" }] },
    flag: { order: 3, text: "Flag", type: "bool", value: true },
    heading: { order: 4, text: "just a label", type: "text" },
  } } }));
  __mem.set("we/demo/main.html", '<html><body><script>var log={};localStorage.setItem("k","v");log.storage=localStorage.getItem("k");window.wallpaperRegisterAudioListener(function(a){log.audio=a.length});window.wallpaperPropertyListener={applyUserProperties:function(p){for(var k in p)log[k]=p[k].value},applyGeneralProperties:function(g){log.fps=g.fps},setPaused:function(x){log.paused=x}};</scr' + 'ipt></body></html>');
  return plugin.setActive(plugin.addItems(["we/demo"], "package", "WE Demo")[0]);
});
await wait(1500);
const we1 = await frames()[0].evaluate(() => log);
check("project.json values reach wallpaperPropertyListener", we1.schemecolor === "0.2 0.4 1" && we1.speed === 4 && we1.mode === "b" && we1.flag === true && we1.fps === 30, we1);
check("storage and audio calls do not throw", we1.storage === "v" && we1.audio === 128, we1);
await openSettings();
const weSection = page.locator("#panel > div > div").filter({ hasText: "Scheme color" });
check("its properties appear in order, labels cleaned", JSON.stringify(await weSection.locator(".setting-item-name").allTextContents()) === JSON.stringify(["Settings for “WE Demo”", "Wallpaper Engine", "Scheme color", "Mode", "Speed", "Flag"]));
await weSection.locator("input[type=color]").fill("#ff0000"); await weSection.locator("select").selectOption("a"); await setPaused(true); await wait(200);
const we2 = await frames()[0].evaluate(() => log);
check("edits and pause reach the page in Wallpaper Engine's format", we2.schemecolor === "1 0 0" && we2.mode === "a" && we2.paused === true, we2);
await setPaused(false);

// ---------------------------------------------------------------------------
section("Library");
await openSettings();
const rows = page.locator("#panel .scenery-item");
const count = await rows.count();
check("every library row has a thumbnail", (await page.locator("#panel .scenery-item > .scenery-thumb").count()) === count && count > 8, count);
check("effect thumbnails draw without animating", await run(() => { const c = document.querySelector("#panel .scenery-thumb canvas"); return c.width > 0 && c.getContext("2d").getImageData(c.width >> 1, c.height >> 1, 1, 1).data[3] === 255; }));
check("scene thumbnails are built from the scene's layers", (await page.locator("#panel .scenery-thumb .scenery-sl").count()) > 0);
check("the settings do not overflow the pane sideways", await run(() => { const p = document.querySelector("#panel"); return p.scrollWidth <= p.clientWidth; }));
await page.locator('#panel .scenery-library button[data-icon="plus"]').click();
check("the + button offers every way to add a wallpaper", (await run(() => __menu.items.length)) === 6);
await rows.first().locator('button[data-icon="pencil"]').click();
await run(() => { const i = __modal.contentEl.querySelector("input"); i.value = "Northern lights"; i.dispatchEvent(new Event("input")); __modal.contentEl.querySelector("button").click(); }); await wait(200);
check("rename changes the item's name", (await run(() => plugin.settings.items[0].name)) === "Northern lights" && (await rows.first().locator(".setting-item-name").textContent()) === "Northern lights");
const order1 = await run(() => plugin.settings.items.map((i) => i.id));
// Obsidian draws the drag handle and reports the move; call what it would call.
await run(() => __tab.settingItems.find((d) => d.type === "list").onReorder(0, 2)); await wait(200);
const order2 = await run(() => plugin.settings.items.map((i) => i.id));
check("reordering the list reorders the library", order2[2] === order1[0] && order2[0] === order1[1], { order1: order1.slice(0, 3), order2: order2.slice(0, 3) });
check("settings are saved", (await run(() => __saved?.items?.[2]?.name)) === "Northern lights");
await run(() => { const p = document.querySelector("#panel"); p.style.height = "400px"; p.scrollTop = 260; });
// Click from inside the page: a Playwright click would scroll the button into view first.
const scrollBefore = await run(() => { const p = document.querySelector("#panel"); const top = p.scrollTop; [...p.querySelectorAll('.scenery-item button[data-icon="trash-2"]')].at(-1).click(); return top; });
await wait(300);
check("removing a wallpaper keeps the settings scrolled where they were", scrollBefore > 200 && Math.abs((await run(() => document.querySelector("#panel").scrollTop)) - scrollBefore) < 5 && (await rows.count()) === count - 1, { scrollBefore, after: await run(() => document.querySelector("#panel").scrollTop) });
await run(() => { document.querySelector("#panel").style.height = ""; });

const dimVar = () => run(() => document.querySelector(".scenery-root").style.getPropertyValue("--scenery-dim"));
await run(() => plugin.setActive("effect-snow")); await openSettings();
const ownToggle = page.locator("#panel .setting-item").filter({ hasText: "Give this wallpaper its own appearance" }).locator("input[type=checkbox]");
const sharedDim = await dimVar();
await ownToggle.check(); await wait(200);
check("turning on a wallpaper's own appearance changes nothing by itself", (await dimVar()) === sharedDim && (await run(() => !!plugin.activeItem.look)));
const dimSlider = page.locator("#panel .setting-item").filter({ hasText: "Readability dimming" }).locator("input[type=range]");
await dimSlider.evaluate((el) => { el.value = 10; el.dispatchEvent(new Event("input")); el.dispatchEvent(new Event("change")); }); await wait(200);
check("its sliders change that wallpaper only", (await dimVar()) === "0.1" && (await run(() => plugin.settings.dim)) === 25 && (await run(() => plugin.activeItem.look.dim)) === 10);
await run(() => plugin.setActive("effect-rain")); await wait(100);
check("other wallpapers keep the shared appearance", (await dimVar()) === sharedDim);
await run(() => plugin.setActive("effect-snow")); await wait(100);
check("coming back restores the wallpaper's own appearance", (await dimVar()) === "0.1");
await openSettings(); await ownToggle.uncheck(); await wait(200);
check("turning it off returns to the shared appearance", (await dimVar()) === sharedDim && (await run(() => plugin.activeItem.look === undefined)));
await shot("library");

// ---------------------------------------------------------------------------
section("Undo, filter, sections, theme wallpapers, linked scenes");
await openSettings();
const before2 = await run(() => ({ ids: plugin.settings.items.map((i) => i.id), active: plugin.settings.activeId }));
await run(() => { const rows = [...document.querySelectorAll("#panel .scenery-item")]; rows.find((r) => r.classList.contains("is-active")).querySelector('button[data-icon="trash-2"]').click(); }); await wait(300);
check("removing the active wallpaper moves on to another", (await run(() => plugin.settings.items.length)) === before2.ids.length - 1 && (await run(() => plugin.settings.activeId)) !== before2.active);
await run(() => [...document.querySelectorAll(".notice .scenery-undo")].at(-1).click()); await wait(300);
const after2 = await run(() => ({ ids: plugin.settings.items.map((i) => i.id), active: plugin.settings.activeId }));
check("undo puts it back in the same place and makes it active again", JSON.stringify(after2) === JSON.stringify(before2), after2);
check("the settings list shows it again", (await page.locator("#panel .scenery-item").count()) === before2.ids.length);

const shownRows = page.locator("#panel .scenery-item:visible");
const total = await shownRows.count();
const search = page.locator("#panel .scenery-library input[type=search]");
await search.fill("rain"); await wait(100);
check("searching the list narrows it and keeps the field focused", (await shownRows.count()) === 1 && (await run(() => document.activeElement?.type)) === "search");
await search.fill("Scene ·"); await wait(100);
const scenesShown = await shownRows.count();
check("the search also matches a wallpaper's type", scenesShown > 0 && scenesShown === (await run(() => plugin.settings.items.filter((i) => i.type === "scene").length)));
await search.fill(""); await wait(100);
check("clearing the search shows everything", (await shownRows.count()) === total);

check("slideshow options appear only while the slideshow is on", (await page.locator("#panel .setting-item:visible").filter({ hasText: "Interval (minutes)" }).count()) === 0);
await page.locator("#panel .setting-item").filter({ hasText: "Switch automatically" }).locator("input[type=checkbox]").check(); await wait(200);
check("turning the slideshow on reveals them", (await page.locator("#panel .setting-item:visible").filter({ hasText: "Interval (minutes)" }).count()) === 1 && (await run(() => plugin.settings.slideshow)));
await page.locator("#panel .setting-item").filter({ hasText: "Switch automatically" }).locator("input[type=checkbox]").uncheck();

const themeRows = page.locator("#panel .setting-item").filter({ hasText: "When the theme is" });
await themeRows.nth(0).locator("select").selectOption("effect-snow");
await themeRows.nth(1).locator("select").selectOption("effect-rain"); await wait(200);
check("assigning the current theme's wallpaper applies it", (await run(() => plugin.settings.activeId)) === "effect-rain");
const setTheme = (dark) => run((d) => { document.body.classList.toggle("theme-dark", d); document.body.classList.toggle("theme-light", !d); __workspaceOn["css-change"].forEach((f) => f()); }, dark);
await setTheme(false); await wait(200);
check("switching to the light theme switches the wallpaper", (await run(() => plugin.settings.activeId)) === "effect-snow");
await run(() => plugin.setActive("effect-aurora")); await run(() => __workspaceOn["css-change"].forEach((f) => f())); await wait(100);
check("a manual choice is kept while the theme stays the same", (await run(() => plugin.settings.activeId)) === "effect-aurora");
await setTheme(true); await wait(200);
check("switching back to dark switches again", (await run(() => plugin.settings.activeId)) === "effect-rain");
await run(() => { plugin.settings.themeWallpapers = { light: "", dark: "" }; });

const linked = await run(async () => { const scene = plugin.settings.items.find((i) => i.type === "scene" && i.folder); await plugin.setActive(scene.id); return { id: scene.id, folder: scene.folder, layers: scene.scene.length }; });
check("an exported scene is linked to its folder", linked.folder === "Scenery/Scene 1", linked);
await wait(3100); // let the guard against our own export pass
await run((folder) => { const path = folder + "/scenery.json"; const m = JSON.parse(__mem.get(path)); m.layers = m.layers.slice(0, 2); m.layers[0].color = "#112233"; __mem.set(path, JSON.stringify(m)); __vaultOn.modify.forEach((f) => f({ path })); }, linked.folder);
await wait(1800);
const relinked = await run((id) => { const scene = plugin.settings.items.find((i) => i.id === id); return { layers: scene.scene.length, color: scene.scene[0].color, shown: document.querySelectorAll(".scenery-layer.is-visible .scenery-sl").length }; }, linked.id);
check("saving into that folder updates the scene and the wallpaper", relinked.layers === 2 && relinked.color === "#112233" && relinked.shown === 2, relinked);
const dupes = await run((folder) => plugin.settings.items.filter((i) => i.folder === folder).length, linked.folder);
check("the scene is updated in place, not duplicated", dupes === 1, dupes);

// ---------------------------------------------------------------------------
section("Pop-out windows");
await run(() => plugin.setActive("effect-starfield"));
const pop = await run(() => new Promise((resolve) => { const f = document.createElement("iframe"); f.id = "popout"; f.style.cssText = "position:fixed;right:0;bottom:0;width:400px;height:240px;z-index:9"; f.onload = () => { patchWindow(f.contentWindow); __workspaceOn["window-open"].forEach((fn) => fn({}, f.contentWindow)); resolve(true); }; f.src = "/popout.html"; document.body.append(f); }));
await wait(600);
const popFrame = page.frames().find((f) => f.url().endsWith("/popout.html"));
const sample = () => popFrame.evaluate(() => { const c = document.querySelector(".scenery-root canvas"); return c ? Array.from(c.getContext("2d").getImageData(0, 0, c.width, c.height).data).reduce((a, v, i) => (a + v * (i % 97)) % 1000003, 0) : null; });
const s1 = await sample(); await wait(500); const s2 = await sample();
check("a new window gets its own wallpaper layer", pop && s1 !== null && (await popFrame.evaluate(() => document.documentElement.classList.contains("scenery-on") && getComputedStyle(document.querySelector(".app-container")).backgroundColor)) === "rgba(0, 0, 0, 0)");
check("the effect animates on that window's own frame loop", s1 !== s2);
await run(() => plugin.setActive("effect-aurora")); await wait(1600);
check("switching wallpapers updates every window", (await popFrame.evaluate(() => document.querySelectorAll(".scenery-layer.is-visible").length)) === 1 && (await sample()) !== s2);
await run(() => { plugin.settings.popouts = false; plugin.syncWindows(); plugin.refresh(); });
check("turning the setting off removes the layer from pop-outs only", (await popFrame.evaluate(() => !document.querySelector(".scenery-root") && !document.documentElement.classList.contains("scenery-on"))) && (await run(() => !!document.querySelector(".scenery-root"))));

// ---------------------------------------------------------------------------
section("Page errors");
check("no uncaught errors in the page", pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
