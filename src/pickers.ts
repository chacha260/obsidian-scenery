import { App, FuzzySuggestModal, TFile, TFolder } from "obsidian";
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
