import { afterEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { Popover } from "./Popover";
import { SplitButton } from "./SplitButton";

let host: HTMLElement;
let dispose: () => void;
let pressed = 0;
let picked: string[] = [];

function mount(ui: () => unknown) {
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(ui as never, host);
  flush();
}
afterEach(() => { dispose?.(); host?.remove(); pressed = 0; picked = []; });

const key = (el: Element, k: string) => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); flush(); };
const click = (el: Element) => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); flush(); };
const caret = () => host.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")!;
const menu = () => host.querySelector<HTMLElement>("[role=menu]");
const items = () => Array.from(host.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));

function mountSplit() {
  mount(() => (
    <>
      <SplitButton
        label="Send"
        onPress={() => { pressed++; }}
        menu={<>
          {["One", "Two", "Three"].map((n) => <button type="button" role="menuitem" onClick={() => picked.push(n)}>{n}</button>)}
        </>}
      />
      <button id="outside" type="button">outside</button>
    </>
  ));
}

describe("SplitButton", () => {
  it("main button presses, caret has haspopup and expanded", () => {
    mountSplit();
    expect(caret().getAttribute("aria-haspopup")).toBe("menu");
    expect(caret().getAttribute("aria-expanded")).toBe("false");
    click(host.querySelector("button")!);
    expect(pressed).toBe(1);
    expect(menu()).toBeNull();
  });

  it("opens by click, focuses the first item and toggles closed", () => {
    mountSplit();
    click(caret());
    expect(menu()).not.toBeNull();
    expect(caret().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(items()[0]);
    click(caret());
    expect(menu()).toBeNull();
    expect(caret().getAttribute("aria-expanded")).toBe("false");
  });

  it.each(["Enter", " ", "ArrowDown"])("opens by key %j", (k) => {
    mountSplit();
    caret().focus();
    key(caret(), k);
    expect(menu()).not.toBeNull();
    expect(document.activeElement).toBe(items()[0]);
  });

  it("moves with ArrowUp, ArrowDown, Home and End and keeps one tab stop", () => {
    mountSplit();
    click(caret());
    const [a, b, c] = items();
    key(a!, "ArrowDown");
    expect(document.activeElement).toBe(b);
    key(b!, "ArrowDown");
    expect(document.activeElement).toBe(c);
    key(c!, "ArrowDown");
    expect(document.activeElement).toBe(a);
    key(a!, "ArrowUp");
    expect(document.activeElement).toBe(c);
    key(c!, "Home");
    expect(document.activeElement).toBe(a);
    key(a!, "End");
    expect(document.activeElement).toBe(c);
    expect(items().map((i) => i.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("Escape closes and returns focus to the caret", () => {
    mountSplit();
    click(caret());
    key(items()[1]!, "Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(caret());
  });

  it("choosing an item runs it, closes and returns focus", () => {
    mountSplit();
    click(caret());
    click(items()[1]!);
    expect(picked).toEqual(["Two"]);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(caret());
  });

  it("closes on pointerdown outside but not inside", () => {
    mountSplit();
    click(caret());
    items()[0]!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    flush();
    expect(menu()).not.toBeNull();
    host.querySelector("#outside")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    flush();
    expect(menu()).toBeNull();
  });

  it("closes when focus leaves to another element", () => {
    mountSplit();
    click(caret());
    const out = host.querySelector<HTMLElement>("#outside")!;
    items()[0]!.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: out }));
    flush();
    expect(menu()).toBeNull();
  });
});

describe("Popover", () => {
  it("a dialog popover renders in place with its role and label, closes on Escape", () => {
    const [open, setOpen] = createSignal(true);
    mount(() => (
      <span>
        <button id="a" type="button">anchor</button>
        <Popover open={open()} onClose={() => setOpen(false)} anchor={() => host.querySelector<HTMLElement>("#a")!} role="dialog" label="Amount" placement="top">
          <input aria-label="Amount value" />
        </Popover>
      </span>
    ));
    const d = host.querySelector<HTMLElement>("[role=dialog]")!;
    expect(d.getAttribute("aria-label")).toBe("Amount");
    expect(d.dataset.placement).toBe("top");
    expect(host.contains(d)).toBe(true);
    key(d.querySelector("input")!, "Escape");
    expect(host.querySelector("[role=dialog]")).toBeNull();
    expect(document.activeElement).toBe(host.querySelector("#a"));
  });
});
