import { TABLE_ID } from "../generated/params";
import { NOTICE_NO_FLASH, NOTICE_NOT_SEEN } from "./notices";
import styles from "./Shell.module.css";

export function Footer() {
  return (
    <footer class={styles.footer}>
      <span>table <code>{TABLE_ID}</code></span>
      {" · "}
      <span data-testid="notice-no-flash">{NOTICE_NO_FLASH}</span>
      {" · "}
      <span data-testid="notice-not-seen">{NOTICE_NOT_SEEN}</span>
    </footer>
  );
}
