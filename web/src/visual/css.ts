import { createEffect } from "solid-js";

/**
 * Inline styles that pass the production CSP (style-src 'self', design 4.10). A style attribute
 * is blocked by that policy; writes through the CSSOM (element.style) are not. Use this instead of
 * the JSX `style` prop. A property whose value is undefined is removed.
 */
export type Css = Record<string, string | undefined>;

export function applyStyle(el: HTMLElement, css: Css) {
  for (const [k, v] of Object.entries(css)) {
    if (v === undefined) el.style.removeProperty(k); else el.style.setProperty(k, v);
  }
}

/**
 * Keep an element's inline style in step with `css()`. Call it in the component body (the effect needs
 * that owner, not a ref callback) with a getter for the element, which the effect reads after render.
 */
export function bindStyle(el: () => HTMLElement, css: () => Css) {
  createEffect(css, (c) => applyStyle(el(), c));
}
