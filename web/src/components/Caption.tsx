import { help } from "../state/help";
import styles from "./Dock.module.css";

/** The help line that names the path of the row being pointed at (design 4.12.9). It lives in the dock (R6.8). */
export const Caption = () => (
  <p class={styles.help} data-part="caption" aria-live="polite">{help()}</p>
);
