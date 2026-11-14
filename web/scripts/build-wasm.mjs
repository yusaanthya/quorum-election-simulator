// Builds the Go simulation for the browser into wasm-public/, next to Go's JS loader.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const outDir = fileURLToPath(new URL("../wasm-public/wasm", import.meta.url));
mkdirSync(outDir, { recursive: true });

execFileSync("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", join(outDir, "quorum.wasm"), "./cmd/wasm"], {
  cwd: repoRoot,
  stdio: "inherit",
  env: { ...process.env, GOOS: "js", GOARCH: "wasm" },
});

const goroot = execFileSync("go", ["env", "GOROOT"], { encoding: "utf8" }).trim();
// Go 1.24 moved the loader from misc/wasm to lib/wasm.
const loader = [join(goroot, "lib", "wasm", "wasm_exec.js"), join(goroot, "misc", "wasm", "wasm_exec.js")].find(existsSync);
if (!loader) throw new Error(`wasm_exec.js not found under ${goroot}`);
copyFileSync(loader, join(outDir, "wasm_exec.js"));
console.log(`Built ${join(outDir, "quorum.wasm")}`);
