import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { version } from "../dist/index.js";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));

async function readPackage() {
  const source = await readFile(new URL("../package.json", import.meta.url), "utf8");
  return JSON.parse(source);
}

test("build exports the package version", async () => {
  const pkg = await readPackage();
  assert.equal(version, pkg.version);
});

test("package is the public lapsha entry", async () => {
  const pkg = await readPackage();
  assert.equal(pkg.name, "lapsha");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.private, undefined);
  assert.deepEqual(pkg.exports["."], {
    types: "./dist/index.d.ts",
    import: "./dist/index.js",
  });
  assert.deepEqual(pkg.files, ["dist"]);
});

test("published tarball is the build, the readme, and the license", async () => {
  const { stdout } = await execFileAsync("pnpm", ["pack", "--dry-run", "--json"], {
    cwd: root,
  });
  const packed = JSON.parse(stdout);
  const paths = packed.files.map((file) => file.path).sort();
  assert.deepEqual(paths, [
    "LICENSE",
    "README.md",
    "dist/connection.d.ts",
    "dist/connection.js",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/journal.d.ts",
    "dist/journal.js",
    "dist/workflow.d.ts",
    "dist/workflow.js",
    "package.json",
  ]);
});
