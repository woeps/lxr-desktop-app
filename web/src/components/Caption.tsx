import { applyStyle } from "../visual/css";

/** The line under the journey that names the path of the row being pointed at (design 4.12.9). */
export const Caption = (props: { text: string }) => (
  <p data-part="caption" aria-live="polite" ref={(el: HTMLElement) => applyStyle(el, { "min-height": "1.4em", margin: "8px 0 0" })}>{props.text}</p>
);
