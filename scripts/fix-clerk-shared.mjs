// Fixes @clerk/shared v4.25.5 packaging bug: exports map promises .mjs files
// but only .js (CJS) files are shipped. Creates .mjs wrappers for missing files.
import { readdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const distDir = join(
  import.meta.dirname,
  "..",
  "node_modules",
  "@clerk",
  "shared",
  "dist",
);

if (!existsSync(distDir)) process.exit(0);

for (const entry of readdirSync(distDir)) {
  if (!entry.endsWith(".js") || entry.endsWith(".d.js")) continue;

  const mjsPath = join(distDir, entry.replace(/\.js$/, ".mjs"));
  if (existsSync(mjsPath)) continue;

  const jsContent = readFileSync(join(distDir, entry), "utf8");
  const namedExports = [];
  const exportRegex = /exports\.(\w+)\s*=/g;
  let match;
  while ((match = exportRegex.exec(jsContent)) !== null) {
    namedExports.push(match[1]);
  }

  if (namedExports.length === 0) continue;

  const mjsContent =
    `import mod from './${entry}';\n` +
    `const { ${namedExports.join(", ")} } = mod;\n` +
    `export { ${namedExports.join(", ")} };\n` +
    `export default mod;\n`;

  writeFileSync(mjsPath, mjsContent);
}
