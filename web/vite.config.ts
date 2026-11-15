import { defineConfig } from "vite";

// Two builds share one front end:
//   default mode -> talks to `quorum serve` over HTTP; output is embedded in the Go binary
//   wasm mode    -> runs the Go simulation in the browser; output is a static site for Cloudflare Pages
export default defineConfig(({ mode }) => {
  const wasm = mode === "wasm";
  return {
    publicDir: wasm ? "wasm-public" : false,
    build: {
      outDir: wasm ? "dist-pages" : "../internal/web/dist",
      emptyOutDir: true,
      chunkSizeWarningLimit: 1000,
    },
    server: {
      proxy: wasm ? undefined : { "/api": "http://localhost:8080" },
    },
  };
});
