import { build } from "vite";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

const result = await build({
  configFile: false,
  logLevel: "warn",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    write: false,
    minify: true,
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve("src/main.tsx"),
      name: "VaultBreach",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        banner: "globalThis.__VAULT_SOLO_PREVIEW__ = true;",
      },
    },
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(
  (r) => r.output,
);
const js = outputs
  .filter((o) => o.type === "chunk")
  .map((o) => o.code)
  .join("\n")
  .replace(/<\/script/gi, "<\\/script");
const css = outputs
  .filter((o) => o.type === "asset" && o.fileName.endsWith(".css"))
  .map((o) => String(o.source))
  .join("\n");
if (!js || !css) throw new Error("The standalone bundle is incomplete.");
if (/\bprocess\.env\.NODE_ENV/.test(js))
  throw new Error("The standalone bundle still requires a Node environment.");
const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#101521"><title>Vault Breach — Standalone Solo</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
await writeFile("PLAY-SOLO.html", html);
console.log(
  `Created PLAY-SOLO.html (${Math.round(Buffer.byteLength(html) / 1024)} KiB). Open it directly in a WebGL 2 browser.`,
);
