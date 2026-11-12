let dragging: { group: string; index: number } | null = null;

/** Move the element at `from` so it ends up at index `to`. */
export function moveItem<T>(list: T[], from: number, to: number) {
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
}

/**
 * Make a row draggable onto its siblings. Rows of one list share a `group`;
 * `onMove` receives the indices of the dragged row and of the row it was dropped on.
 */
export function reorderable(el: HTMLElement, group: string, index: number, onMove: (from: number, to: number) => void) {
  el.draggable = true;
  el.addEventListener("dragstart", (e) => {
    dragging = { group, index };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    }
    el.classList.add("is-dragging");
  });
  el.addEventListener("dragend", () => {
    dragging = null;
    el.classList.remove("is-dragging");
  });
  el.addEventListener("dragover", (e) => {
    if (dragging?.group !== group || dragging.index === index) return;
    e.preventDefault();
    el.classList.add("is-drop-target");
  });
  el.addEventListener("dragleave", () => el.classList.remove("is-drop-target"));
  el.addEventListener("drop", (e) => {
    el.classList.remove("is-drop-target");
    if (dragging?.group !== group) return;
    e.preventDefault();
    const from = dragging.index;
    dragging = null;
    if (from !== index) onMove(from, index);
  });
}
