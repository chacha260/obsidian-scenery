import { App, Platform, TFile, normalizePath } from "obsidian";

/** Turn a vault path, absolute path or URL into something an element can load. */
export function resolveSource(app: App, source: string): string {
  if (/^(https?|data|blob|app|file):/i.test(source)) return source;
  const file = app.vault.getAbstractFileByPath(normalizePath(source));
  if (file instanceof TFile) return app.vault.getResourcePath(file);
  if (/^(\/|[A-Za-z]:[\\/])/.test(source)) {
    const path = source.replace(/\\/g, "/").replace(/^\//, "");
    return Platform.resourcePathPrefix + encodeURI(path).replace(/#/g, "%23").replace(/\?/g, "%3F");
  }
  return source;
}
