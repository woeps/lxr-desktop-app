import { createSignal, flush } from "solid-js";

/** The help line for the row being pointed at. The page sets it, the dock shows it (R6.8). */
const [help, setHelpSignal] = createSignal("");
export { help };
export const setHelp = (text: string) => { setHelpSignal(text); flush(); };
