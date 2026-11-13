// Small form controls for the Studio's panels.

function row(parent: HTMLElement, label: string) {
  const el = parent.createDiv({ cls: "field" });
  el.createEl("label", { text: label });
  return el;
}

export function slider(parent: HTMLElement, label: string, value: number, range: [number, number, number], onChange: (v: number) => void) {
  const el = row(parent, label);
  const input = el.createEl("input");
  input.type = "range";
  [input.min, input.max, input.step] = range.map(String);
  input.value = String(value);
  const readout = el.createSpan({ cls: "readout", text: String(value) });
  input.addEventListener("input", () => {
    readout.textContent = input.value;
    onChange(Number(input.value));
  });
  return input;
}

export function select(parent: HTMLElement, label: string, value: string, options: Record<string, string>, onChange: (v: string) => void) {
  const el = row(parent, label);
  const input = el.createEl("select");
  for (const [key, text] of Object.entries(options)) {
    const option = input.createEl("option", { text });
    option.value = key;
  }
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  return input;
}

export function toggle(parent: HTMLElement, label: string, value: boolean, onChange: (v: boolean) => void) {
  const el = row(parent, label);
  const input = el.createEl("input");
  input.type = "checkbox";
  input.checked = value;
  input.addEventListener("change", () => onChange(input.checked));
  return input;
}

export function color(parent: HTMLElement, label: string, value: string, onChange: (v: string) => void) {
  const el = row(parent, label);
  const input = el.createEl("input");
  input.type = "color";
  input.value = value;
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

/** `live` fires on every keystroke; otherwise only when the field is committed. */
export function text(parent: HTMLElement, label: string, value: string, onChange: (v: string) => void, live = false, placeholder = "") {
  const el = row(parent, label);
  const input = el.createEl("input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  input.addEventListener(live ? "input" : "change", () => onChange(input.value));
  return input;
}

export function button(parent: HTMLElement, label: string, onClick: (e: MouseEvent) => void, cls = "") {
  const el = parent.createEl("button", { text: label, cls });
  el.type = "button";
  el.addEventListener("click", onClick);
  return el;
}

let toastTimer = 0;
export function toast(message: string) {
  let el = activeDocument.querySelector<HTMLElement>("#toast");
  if (!el) {
    el = activeDocument.body.createDiv();
    el.id = "toast";
  }
  el.textContent = message;
  el.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("is-visible"), 4000);
}
