import { cp, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const outputDirectory = "dist";
const rootRuntimeDirectories = [
  "background",
  "blocked",
  "newtab",
  "options",
  "popup",
  "quotes",
  "shared",
];
const staticPageOptions = {
  recursive: true,
  filter: (source) => !source.endsWith(".ts"),
};

await rm(outputDirectory, { recursive: true, force: true });
await Promise.all(rootRuntimeDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
await run(process.platform === "win32" ? "npx.cmd" : "npx", ["tsc"]);
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  cp("manifest.json", `${outputDirectory}/manifest.json`),
  cp("src/popup", `${outputDirectory}/popup`, staticPageOptions),
  cp("src/options", `${outputDirectory}/options`, staticPageOptions),
  cp("src/blocked", `${outputDirectory}/blocked`, staticPageOptions),
  cp("src/shared/quotes", `${outputDirectory}/quotes`, { recursive: true }),
]);
await Promise.all([
  cp("dist/background", "background", { recursive: true }),
  cp("dist/shared", "shared", { recursive: true }),
  cp("dist/popup", "popup", { recursive: true }),
  cp("dist/options", "options", { recursive: true }),
  cp("dist/blocked", "blocked", { recursive: true }),
  cp("dist/quotes", "quotes", { recursive: true }),
]);
