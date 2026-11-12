import type { App } from "obsidian";
import { TFile, normalizePath } from "./obsidian-shim";

/**
 * The project's files, held in memory. It also poses as the small part of Obsidian's
 * `app` that the shared rendering code uses to find and load files.
 */
export class MemoryVault {
  private files = new Map<string, Blob>();
  private urls = new Map<string, string>();

  put(path: string, data: Blob | string) {
    path = normalizePath(path);
    const old = this.urls.get(path);
    if (old) URL.revokeObjectURL(old);
    this.urls.delete(path);
    this.files.set(path, typeof data === "string" ? new Blob([data], { type: "text/plain" }) : data);
  }

  delete(path: string) {
    path = normalizePath(path);
    const old = this.urls.get(path);
    if (old) URL.revokeObjectURL(old);
    this.urls.delete(path);
    this.files.delete(path);
  }

  has(path: string) {
    return this.files.has(normalizePath(path));
  }

  get(path: string) {
    return this.files.get(normalizePath(path));
  }

  paths() {
    return [...this.files.keys()];
  }

  url(path: string) {
    path = normalizePath(path);
    let url = this.urls.get(path);
    const blob = this.files.get(path);
    if (!url && blob) this.urls.set(path, (url = URL.createObjectURL(blob)));
    return url ?? path;
  }

  /** A file name not yet used in `dir`. */
  freeName(dir: string, name: string) {
    let candidate = `${dir}/${name}`;
    for (let n = 2; this.has(candidate); n++) candidate = `${dir}/${n}-${name}`;
    return candidate;
  }

  readonly app = {
    vault: {
      adapter: {
        read: async (path: string) => {
          const blob = this.get(path);
          if (!blob) throw new Error(`not found: ${path}`);
          return blob.text();
        },
        exists: async (path: string) => this.has(path),
        getResourcePath: (path: string) => this.url(path),
      },
      getAbstractFileByPath: (path: string) => (this.has(path) ? new TFile(normalizePath(path)) : null),
      getResourcePath: (file: TFile) => this.url(file.path),
    },
  } as unknown as App;
}
