import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const swPath = join(dist, "sw.js");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

const files = await walk(dist);
const urls = files
  .map((file) => `/${relative(dist, file).split(sep).join("/")}`)
  .filter((url) => !url.endsWith("/sw.js"))
  .sort();

const source = await readFile(swPath, "utf8");
const marker = 'const PRECACHE = [';
const start = source.indexOf(marker);
if (start < 0) throw new Error("PRECACHE marker not found in dist/sw.js");
const end = source.indexOf('];', start);
if (end < 0) throw new Error("PRECACHE array terminator not found in dist/sw.js");

const replacement = `${marker}\n${urls.map((url) => `  ${JSON.stringify(url)}`).join(",\n")}\n`;
const updated = source.slice(0, start) + replacement + source.slice(end);
await writeFile(swPath, updated, "utf8");
console.log(`Injected ${urls.length} Vite build assets into the Neto service-worker precache.`);
