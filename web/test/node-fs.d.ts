// shortcut: @types/node is not installed, so declare the one call tokens.test.ts uses. Upgrade if more node APIs are needed.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}
