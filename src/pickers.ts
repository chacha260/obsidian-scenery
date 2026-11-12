import { App, FuzzySuggestModal, TFile, TFolder } from "obsidian";
import { MANIFEST_FILE, WE_MANIFEST_FILE } from "./package";
import { detectType, WallpaperType } from "./types";

export class FilePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private kinds: WallpaperType[] | null, private onPick: (file: TFile) => void) {
    super(app);
  }
  getItems() {
    return this.app.vault.getFiles().filter((f) => {
      const type = detectType(f.path);
      return type !== null && (!this.kinds || this.kinds.includes(type));
    });
  }
  getItemText(file: TFile) {
    return file.path;
  }
  onChooseItem(file: TFile) {
    this.onPick(file);
  }
}

export class FolderPicker extends FuzzySuggestModal<TFolder> {
  constructor(app: App, private onPick: (folder: TFolder) => void) {
    super(app);
  }
  getItems() {
    return this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
  }
  getItemText(folder: TFolder) {
    return folder.path;
  }
  onChooseItem(folder: TFolder) {
    this.onPick(folder);
  }
}

/** Folders that hold a wallpaper package (ours or a Wallpaper Engine web wallpaper). */
export class PackagePicker extends FuzzySuggestModal<TFolder> {
  constructor(app: App, private onPick: (folder: TFolder) => void) {
    super(app);
  }
  getItems() {
    const folders = new Set<TFolder>();
    for (const file of this.app.vault.getFiles()) {
      if ((file.name === MANIFEST_FILE || file.name === WE_MANIFEST_FILE) && file.parent && !file.parent.isRoot()) folders.add(file.parent);
    }
    return [...folders];
  }
  getItemText(folder: TFolder) {
    return folder.path;
  }
  onChooseItem(folder: TFolder) {
    this.onPick(folder);
  }
}
