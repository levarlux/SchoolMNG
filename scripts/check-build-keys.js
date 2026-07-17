const fs = require("fs");
const path = require("path");

function walk(dir) {
  let files = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files = files.concat(walk(fullPath));
    } else {
      files.push(fullPath);
    }
  });
  return files;
}

const outDir = path.join(__dirname, "..", "out");
if (!fs.existsSync(outDir)) {
  console.log("No out/ directory found!");
  process.exit(1);
}

const files = walk(outDir);
console.log(`Checking ${files.length} files in out/ for keys...`);

files.forEach(file => {
  if (file.endsWith(".js") || file.endsWith(".html") || file.endsWith(".json")) {
    const content = fs.readFileSync(file, "utf8");
    if (content.includes("pk_test")) {
      console.log(`[FOUND pk_test] in ${path.relative(outDir, file)}`);
      // Find where pk_test is
      const index = content.indexOf("pk_test");
      console.log("Context:", content.substring(Math.max(0, index - 50), Math.min(content.length, index + 100)));
    }
    if (content.includes("pk_live")) {
      console.log(`[FOUND pk_live] in ${path.relative(outDir, file)}`);
      const index = content.indexOf("pk_live");
      console.log("Context:", content.substring(Math.max(0, index - 50), Math.min(content.length, index + 100)));
    }
  }
});
