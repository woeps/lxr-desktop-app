/** Minimal browser surface, so tests can pass fakes. */
export interface DownloadEnv {
  document: {
    createElement(tag: "a"): HTMLAnchorElement;
    body: { appendChild(n: HTMLAnchorElement): unknown; removeChild(n: HTMLAnchorElement): unknown };
  };
  url: { createObjectURL(b: Blob): string; revokeObjectURL(u: string): void };
}

/** Save data as a file with a Blob and a clicked <a download>; nothing is sent over the network. */
export function download(
  filename: string,
  data: BlobPart,
  mime: string,
  env: DownloadEnv = { document, url: URL },
): void {
  const href = env.url.createObjectURL(new Blob([data], { type: mime }));
  const a = env.document.createElement("a");
  a.href = href;
  a.download = filename;
  env.document.body.appendChild(a);
  a.click();
  env.document.body.removeChild(a);
  env.url.revokeObjectURL(href);
}
