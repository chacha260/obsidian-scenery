import { t } from "../src/i18n";

/**
 * The preview area. It reproduces the plugin's DOM (root > layer + dimming), so the
 * plugin's own stylesheet and rendering code draw here exactly as they do in Obsidian.
 */
export class Stage {
  readonly el: HTMLElement;
  readonly root: HTMLElement;
  /** Where a mode puts what it renders. */
  readonly content: HTMLElement;
  private mock: HTMLElement;
  private outline: HTMLElement;
  private parallax = 0;
  private dim = 55;
  private mockOn = true;

  onPointer: (pointer: { x: number; y: number }) => void = () => undefined;
  /** Drag distance in percent of the stage, per pointer move. */
  onDrag: (dx: number, dy: number) => void = () => undefined;
  onDragEnd: () => void = () => undefined;
  /** Positive = wheel scrolled away from the user. */
  onWheel: (direction: number) => void = () => undefined;

  constructor(parent: HTMLElement) {
    this.el = parent.createDiv({ cls: "stage" });
    this.root = this.el.createDiv({ cls: "scenery-root" });
    this.content = this.root.createDiv({ cls: "scenery-stage" }).createDiv({ cls: "scenery-layer is-visible" });
    this.root.createDiv({ cls: "scenery-dim" });
    this.outline = this.el.createDiv({ cls: "stage-outline" });
    this.mock = this.el.createDiv({ cls: "mock" });
    this.buildMock();

    const capture = this.el.createDiv({ cls: "stage-capture" });
    let dragging = false;
    capture.addEventListener("pointerdown", (e) => {
      dragging = true;
      capture.setPointerCapture(e.pointerId);
    });
    capture.addEventListener("pointermove", (e) => {
      const rect = this.el.getBoundingClientRect();
      const pointer = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
      this.root.style.setProperty("--scenery-px", `${(0.5 - pointer.x) * 2 * this.parallax}px`);
      this.root.style.setProperty("--scenery-py", `${(0.5 - pointer.y) * 2 * this.parallax}px`);
      this.onPointer(pointer);
      if (dragging) this.onDrag((e.movementX / rect.width) * 100, (e.movementY / rect.height) * 100);
    });
    const end = () => {
      if (dragging) this.onDragEnd();
      dragging = false;
    };
    capture.addEventListener("pointerup", end);
    capture.addEventListener("pointercancel", end);
    capture.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.onWheel(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    this.apply();
  }

  private buildMock() {
    this.mock.createDiv({ cls: "mock-ribbon" });
    const side = this.mock.createDiv({ cls: "mock-side" });
    for (const name of ["Inbox", "Projects", "Daily notes", "Reading list", "Welcome"]) side.createDiv({ text: name });
    const main = this.mock.createDiv({ cls: "mock-main" });
    main.createEl("h1", { text: "Welcome" });
    main.createEl("p", { text: "This mock-up shows how text in a note reads over your wallpaper. Raise the dimming if it is hard to read." });
    main.createEl("p", { text: "The quick brown fox jumps over the lazy dog. いろはにほへと ちりぬるを。" });
    const list = main.createEl("ul");
    for (const item of ["First item", "Second item", "Third item"]) list.createEl("li", { text: item });
  }

  private apply() {
    this.root.style.setProperty("--scenery-dim", String(this.mockOn ? this.dim / 100 : 0));
    this.root.style.setProperty("--scenery-bleed", `${this.parallax}px`);
    this.mock.hidden = !this.mockOn;
  }

  setDim(dim: number) {
    this.dim = dim;
    this.apply();
  }

  /** The mock-up and the dimming go together: without them you see the bare wallpaper. */
  setMock(on: boolean) {
    this.mockOn = on;
    this.apply();
  }

  setParallax(px: number) {
    this.parallax = px;
    this.apply();
  }

  setPaused(paused: boolean) {
    this.root.classList.toggle("is-paused", paused);
  }

  /** Show where the selected layer's frame is. Pass null to hide it. */
  showOutline(frame: { x: number; y: number; scale: number } | null) {
    this.outline.hidden = !frame;
    if (frame) this.outline.style.transform = `translate(${frame.x}%, ${frame.y}%) scale(${frame.scale / 100})`;
    this.outline.title = t("studio.dragHint");
  }
}
