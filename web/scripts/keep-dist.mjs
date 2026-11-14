// Vite empties the output directory, but go:embed needs it to exist in a fresh clone.
import { writeFileSync } from "node:fs";
writeFileSync(new URL("../../internal/web/dist/.gitkeep", import.meta.url), "");
