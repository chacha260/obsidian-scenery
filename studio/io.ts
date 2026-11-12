// Getting projects in and out of the browser.

type DirHandle = {
  name: string;
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;
};
type Picker = (o?: { mode?: string }) => Promise<DirHandle>;

const picker = () => (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;

export const canSaveToFolder = () => typeof picker() === "function";

/** Ask for a folder to save into. Resolves to null if the user cancels. */
export async function chooseFolder(): Promise<DirHandle | null> {
  try {
    return await (picker() as Picker)({ mode: "readwrite" });
  } catch {
    return null;
  }
}

/** Write `files` into `parent/name/`, creating folders as needed. */
export async function writeFolder(parent: DirHandle, name: string, files: Map<string, Blob>) {
  const base = await parent.getDirectoryHandle(name, { create: true });
  for (const [path, blob] of files) {
    const parts = path.split("/");
    const fileName = parts.pop() as string;
    let dir = base;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
    const writable = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
    await writable.write(blob);
    await writable.close();
  }
  return `${parent.name}/${name}`;
}

export function download(fileName: string, blob: Blob) {
  const a = document.body.createEl("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Let the user pick a folder to read. Paths in the result are relative to that folder. */
export function openFolder(): Promise<{ name: string; files: Map<string, File> } | null> {
  return new Promise((resolve) => {
    const input = document.body.createEl("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.hidden = true;
    input.addEventListener("cancel", () => resolve(null));
    input.addEventListener("change", () => {
      const files = new Map<string, File>();
      let name = "";
      for (const file of Array.from(input.files ?? [])) {
        const [top, ...rest] = file.webkitRelativePath.split("/");
        name = top;
        if (rest.length) files.set(rest.join("/"), file);
      }
      input.remove();
      resolve(files.size ? { name, files } : null);
    });
    input.click();
  });
}
