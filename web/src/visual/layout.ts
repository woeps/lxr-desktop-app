/** Writes the height of `el` to a CSS variable on the page root, and keeps it current. */
export function trackHeight(el: HTMLElement, name: string): () => void {
  const root = document.documentElement;
  const write = () => root.style.setProperty(name, `${el.offsetHeight}px`);
  write();
  // shortcut: without ResizeObserver (old test DOMs) the height is measured once; upgrade if needed.
  if (typeof ResizeObserver === "undefined") return () => root.style.removeProperty(name);
  const ro = new ResizeObserver(write);
  ro.observe(el);
  return () => { ro.disconnect(); root.style.removeProperty(name); };
}
