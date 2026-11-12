import { App, normalizePath } from "obsidian";
import { MANIFEST_FILE, PackageManifest } from "./package";
import { newLayer, SceneLayer, uid, WallpaperItem } from "./types";

/** Turn a display name into something safe to use as a folder name. */
export const safeName = (name: string) => name.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim();

/** Create a folder and any missing parents. */
export async function ensureFolder(app: App, folder: string) {
  let path = "";
  for (const part of normalizePath(folder).split("/")) {
    path = path ? `${path}/${part}` : part;
    if (!(await app.vault.adapter.exists(path))) await app.vault.createFolder(path);
  }
}

async function copyFile(app: App, from: string, to: string) {
  const { adapter } = app.vault;
  if (await adapter.exists(to)) await adapter.remove(to);
  await adapter.copy(from, to);
}

async function copyFolder(app: App, from: string, to: string) {
  await ensureFolder(app, to);
  const listing = await app.vault.adapter.list(from);
  for (const file of listing.files) await copyFile(app, file, `${to}/${file.split("/").pop()}`);
  for (const dir of listing.folders) await copyFolder(app, dir, `${to}/${dir.split("/").pop()}`);
}

const isExternal = (source: string) => /^([a-z][a-z0-9+.-]*:|\/)/i.test(source);

/**
 * Write a scene to `folder` as a self-contained package: scenery.json plus copies of
 * the vault files its layers use, referenced by "./" paths so the folder can be moved
 * or shared. URLs and paths outside the vault are kept as they are.
 */
export async function exportScene(app: App, item: WallpaperItem, folder: string) {
  const { adapter } = app.vault;
  await ensureFolder(app, folder);
  const taken = new Map<string, string>();
  const place = async (source: string, dir: string) => {
    // Already inside the export folder (a re-export of an imported scene): just point at it.
    if (source.startsWith(`${folder}/`)) return source.slice(folder.length + 1);
    const existing = taken.get(source);
    if (existing) return existing;
    const base = source.split("/").pop() as string;
    let rel = `${dir}/${base}`;
    for (let n = 2; [...taken.values()].includes(rel); n++) rel = `${dir}/${n}-${base}`;
    taken.set(source, rel);
    return rel;
  };

  const layers: SceneLayer[] = [];
  for (const layer of item.scene ?? []) {
    const copy = { ...layer };
    const source = normalizePath(layer.source || "");
    const local = !!layer.source && !isExternal(layer.source) && (await adapter.exists(source));
    if (local && (layer.kind === "image" || layer.kind === "video")) {
      const rel = await place(source, "assets");
      if (`${folder}/${rel}` !== source) {
        await ensureFolder(app, `${folder}/assets`);
        await copyFile(app, source, `${folder}/${rel}`);
      }
      copy.source = `./${rel}`;
    } else if (local && layer.kind === "package") {
      const rel = await place(source, "packages");
      if (`${folder}/${rel}` !== source) await copyFolder(app, source, `${folder}/${rel}`);
      copy.source = `./${rel}`;
    }
    layers.push(copy);
  }

  const manifest: PackageManifest = { name: item.name, version: "1.0.0", type: "scene", layers };
  await adapter.write(`${folder}/${MANIFEST_FILE}`, JSON.stringify(manifest, null, 2) + "\n");
}

/** Layers of an exported scene, with "./" paths resolved against the folder it now lives in. */
export function importScene(manifest: PackageManifest, folder: string): SceneLayer[] {
  return (manifest.layers ?? []).map((layer) => ({
    ...newLayer(layer.kind, layer.name),
    ...layer,
    id: uid(),
    source: layer.source?.startsWith("./") ? normalizePath(`${folder}/${layer.source.slice(2)}`) : layer.source ?? "",
  }));
}
