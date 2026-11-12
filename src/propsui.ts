import { Setting } from "obsidian";
import { PackageManifest, resolveValues, selectOptions } from "./package";

/** Build one control per property a package declares. `set` receives each new value. */
export function renderProperties(
  el: HTMLElement,
  manifest: PackageManifest,
  saved: Record<string, unknown> | undefined,
  set: (key: string, value: unknown) => void
) {
  const values = resolveValues(manifest, saved);
  for (const [key, p] of Object.entries(manifest.properties ?? {})) {
    const setting = new Setting(el).setName(p.label || key);
    if (p.description) setting.setDesc(p.description);
    if (p.type === "slider") {
      setting.addSlider((sl) => {
        sl.setLimits(p.min ?? 0, p.max ?? 100, p.step ?? 1).setValue(values[key] as number);
        // Update the wallpaper while dragging, not only on release.
        sl.sliderEl.addEventListener("input", () => set(key, Number(sl.sliderEl.value)));
        sl.onChange((v) => set(key, v));
      });
    } else if (p.type === "toggle") {
      setting.addToggle((tg) => tg.setValue(values[key] as boolean).onChange((v) => set(key, v)));
    } else if (p.type === "color") {
      setting.addColorPicker((c) => c.setValue(values[key] as string).onChange((v) => set(key, v)));
    } else if (p.type === "select") {
      setting.addDropdown((d) => d.addOptions(selectOptions(p)).setValue(values[key] as string).onChange((v) => set(key, v)));
    } else {
      setting.addText((tx) => tx.setValue(values[key] as string).onChange((v) => set(key, v)));
    }
  }
}
