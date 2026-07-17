const fs = require("fs");
const path = require("path");

const exePath = "d:\\proograms\\mine\\projects\\Commercial\\SchoolMNG\\src-tauri\\target\\release\\school-library-manager.exe";

if (!fs.existsSync(exePath)) {
  console.log(`Executable not found at: ${exePath}`);
  process.exit(1);
}

console.log(`Reading binary from ${exePath}...`);
const buffer = fs.readFileSync(exePath);

console.log("Searching binary for Clerk publishable key signatures...");

// Search for pk_test or pk_live (ASCII/UTF-8)
const pkTest = Buffer.from("pk_test");
const pkLive = Buffer.from("pk_live");

function findOccurrences(searchBuffer) {
  let indices = [];
  let index = buffer.indexOf(searchBuffer);
  while (index !== -1) {
    indices.push(index);
    index = buffer.indexOf(searchBuffer, index + 1);
  }
  return indices;
}

const testIndices = findOccurrences(pkTest);
const liveIndices = findOccurrences(pkLive);

console.log(`Found ${testIndices.length} occurrences of 'pk_test'`);
console.log(`Found ${liveIndices.length} occurrences of 'pk_live'`);

testIndices.forEach((idx, i) => {
  // Print some context around the occurrence
  const start = Math.max(0, idx - 10);
  const end = Math.min(buffer.length, idx + 100);
  const context = buffer.slice(start, end).toString("ascii").replace(/[^\x20-\x7E]/g, ".");
  console.log(`pk_test [${i}]: ${context}`);
});

liveIndices.forEach((idx, i) => {
  const start = Math.max(0, idx - 10);
  const end = Math.min(buffer.length, idx + 100);
  const context = buffer.slice(start, end).toString("ascii").replace(/[^\x20-\x7E]/g, ".");
  console.log(`pk_live [${i}]: ${context}`);
});

console.log("Searching for Convex URLs...");
const convexUrl = Buffer.from("convex.cloud");
const convexIndices = findOccurrences(convexUrl);
console.log(`Found ${convexIndices.length} occurrences of 'convex.cloud'`);
convexIndices.forEach((idx, i) => {
  const start = Math.max(0, idx - 50);
  const end = Math.min(buffer.length, idx + 100);
  const context = buffer.slice(start, end).toString("ascii").replace(/[^\x20-\x7E]/g, ".");
  console.log(`convex.cloud [${i}]: ${context}`);
});
