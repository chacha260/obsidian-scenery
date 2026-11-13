import { t } from "../src/i18n";
import { makeState, PackageFrame, PackageManifest, readTheme, resolveValues, selectOptions } from "../src/package";
import { TEMPLATE_HTML, templateManifest } from "../src/template";
import * as form from "./form";
import type { Stage } from "./stage";
import type { MemoryVault } from "./vault";

const FOLDER = "pkg";
const NOTE = { name: "Welcome", path: "Notes/Welcome.md" };

/** Write a wallpaper package and try it: code on one side, the running page and its settings on the other. */
export class PackageMode {
  name = t("type.package");
  html = TEMPLATE_HTML;
  manifestText = JSON.stringify(templateManifest(t("type.package")), null, 2);
  private values: Record<string, unknown> = {};
  private allowNote = false;
  private frame: PackageFrame | null = null;
  private paused = false;
  private pointer = { x: 0.5, y: 0.5 };
  private tab: "html" | "manifest" = "html";
  private timer = 0;
  private controls: HTMLElement | null = null;
  private error: HTMLElement | null = null;

  constructor(private vault: MemoryVault, private stage: Stage, private panel: HTMLElement, private onChange: () => void) {}

  activate() {
    this.stage.onPointer = (p) => {
      this.pointer = p;
      this.frame?.post("pointer", p);
    };
    this.stage.onDrag = this.stage.onDragEnd = this.stage.onWheel = () => undefined;
    this.render();
    this.run();
  }

  deactivate() {
    window.clearTimeout(this.timer);
    this.frame?.frame.remove();
    this.frame = null;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.frame?.post("paused", paused);
  }

  themeChanged() {
    this.frame?.post("theme", readTheme(activeDocument));
  }

  private noteFor(manifest: PackageManifest) {
    return this.allowNote && manifest.permissions?.includes("note") ? NOTE : null;
  }

  /** Load the page afresh from the editors' current text. */
  private run() {
    let manifest: PackageManifest;
    try {
      manifest = JSON.parse(this.manifestText) as PackageManifest;
      if (typeof manifest !== "object" || manifest === null) throw new Error("must be an object");
    } catch (e) {
      // Keep the last working page on screen while the JSON is mid-edit.
      if (this.error) this.error.textContent = `${t("studio.badJson")} ${String(e)}`;
      return;
    }
    if (this.error) this.error.textContent = "";
    this.name = manifest.name || this.name;
    this.vault.put(`${FOLDER}/scenery.json`, this.manifestText);
    this.vault.put(`${FOLDER}/${manifest.entry || "index.html"}`, this.html);

    const previous = this.frame;
    const frame = new PackageFrame(this.vault.app, this.stage.content, FOLDER, (m) =>
      makeState(m, this.values, { doc: activeDocument, paused: this.paused, pointer: this.pointer, note: this.noteFor(m), fps: 30 })
    );
    this.frame = frame;
    frame.loaded.then(
      () => previous?.frame.remove(),
      (e) => {
        frame.frame.remove();
        this.frame = previous;
        if (this.error) this.error.textContent = String(e);
      }
    );
    this.renderControls(manifest);
  }

  private edited() {
    this.onChange();
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.run(), 500);
  }

  // ---- saving and loading ----

  files(): Map<string, Blob> {
    const out = new Map<string, Blob>();
    for (const path of this.vault.paths()) {
      if (path.startsWith(`${FOLDER}/`)) out.set(path.slice(FOLDER.length + 1), this.vault.get(path) as Blob);
    }
    return out;
  }

  async load(manifest: PackageManifest, files: Map<string, Blob>) {
    for (const path of this.vault.paths()) if (path.startsWith(`${FOLDER}/`)) this.vault.delete(path);
    for (const [path, blob] of files) this.vault.put(`${FOLDER}/${path}`, blob);
    this.manifestText = await (files.get("scenery.json") as Blob).text();
    this.html = (await files.get(manifest.entry || "index.html")?.text()) ?? "";
    this.name = manifest.name || t("type.package");
    this.values = {};
  }

  // ---- panel ----

  render() {
    const el = this.panel;
    el.empty();
    const tabs = el.createDiv({ cls: "tabs" });
    const editor = el.createEl("textarea", { cls: "code" });
    editor.spellcheck = false;
    const show = (tab: "html" | "manifest") => {
      this.tab = tab;
      editor.value = tab === "html" ? this.html : this.manifestText;
      htmlTab.toggleClass("is-active", tab === "html");
      manifestTab.toggleClass("is-active", tab === "manifest");
    };
    const htmlTab = form.button(tabs, t("studio.html"), () => show("html"));
    const manifestTab = form.button(tabs, t("studio.manifest"), () => show("manifest"));
    editor.addEventListener("input", () => {
      if (this.tab === "html") this.html = editor.value;
      else this.manifestText = editor.value;
      this.edited();
    });
    // Tab inserts two spaces instead of leaving the editor.
    editor.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
      editor.dispatchEvent(new Event("input"));
    });
    show(this.tab);

    this.error = el.createDiv({ cls: "error" });
    el.createEl("h2", { text: t("studio.controls") });
    this.controls = el.createDiv({ cls: "controls" });
  }

  /** The controls Obsidian would generate from the manifest, to try the properties out. */
  private renderControls(manifest: PackageManifest) {
    const el = this.controls;
    if (!el) return;
    el.empty();
    const values = resolveValues(manifest, this.values);
    const set = (key: string) => (value: unknown) => {
      this.values[key] = value;
      this.frame?.post("props", resolveValues(manifest, this.values));
    };
    for (const [key, p] of Object.entries(manifest.properties ?? {})) {
      const label = p.label || key;
      if (p.type === "slider") form.slider(el, label, values[key] as number, [p.min ?? 0, p.max ?? 100, p.step ?? 1], set(key));
      else if (p.type === "toggle") form.toggle(el, label, values[key] as boolean, set(key));
      else if (p.type === "color") form.color(el, label, values[key] as string, set(key));
      else if (p.type === "select") form.select(el, label, values[key] as string, selectOptions(p), set(key));
      else form.text(el, label, values[key] as string, set(key), true);
    }
    if (manifest.permissions?.includes("note")) {
      form.toggle(el, t("studio.note"), this.allowNote, (v) => {
        this.allowNote = v;
        this.frame?.post("note", this.noteFor(manifest));
      });
    }
  }
}
