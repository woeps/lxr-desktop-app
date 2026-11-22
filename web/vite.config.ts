import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";

/**
 * Dev only: Vite's HMR websocket and its injected <style> tags need a looser CSP. The built
 * index.html keeps the strict policy of design 4.10 untouched.
 */
const devCsp = {
  name: "lxr-dev-csp",
  apply: "serve" as const,
  transformIndexHtml: (html: string) =>
    html
      .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
      .replace("connect-src 'none'", "connect-src 'self' ws://127.0.0.1:* ws://localhost:*"),
};

export default defineConfig({
  plugins: [solid(), devCsp],
  base: "./",
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
  test: { environment: "jsdom", passWithNoTests: true },
});
