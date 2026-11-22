import { createContext, createSignal, flush, useContext } from "solid-js";
import type { App } from "./app";

export type PanelId = "library" | "import" | "settings" | "info";

export interface Shell {
  panel(): PanelId | null;
  /** Open `id` (closing any other); toggling the open one closes it (R5.2). */
  toggle(id: PanelId): void;
  close(): void;
  connectionOpen(): boolean;
  openConnection(): void;
  closeConnection(): void;
  /** The icon that opened the panel, the focus return target (R5.4). */
  lastIcon(): HTMLElement | null;
  setLastIcon(el: HTMLElement | null): void;
}

export function createShell(): Shell {
  const [panel, set1] = createSignal<PanelId | null>(null);
  const [conn, set2] = createSignal(false);
  const setPanel = (v: PanelId | null) => { set1(v); flush(); };
  const setConn = (v: boolean) => { set2(v); flush(); };
  let icon: HTMLElement | null = null;
  return {
    panel,
    toggle: (id) => setPanel(panel() === id ? null : id),
    close: () => setPanel(null),
    connectionOpen: conn,
    openConnection: () => setConn(true),
    closeConnection: () => setConn(false),
    lastIcon: () => icon,
    setLastIcon: (el) => { icon = el; },
  };
}

/** Run `fn` when an output exists, otherwise open the connection popover and do nothing (R6.4). */
export function guardOutput<A extends unknown[]>(
  app: Pick<App, "hasOutput">, shell: Pick<Shell, "openConnection">, fn: (...args: A) => void,
): (...args: A) => void {
  return (...args) => { if (app.hasOutput()) fn(...args); else shell.openConnection(); };
}

export const ShellContext = createContext<Shell | null>(null);

export function useShell(): Shell {
  const s = useContext(ShellContext);
  if (!s) throw new Error("useShell outside ShellContext");
  return s;
}
