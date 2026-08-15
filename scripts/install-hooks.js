#!/usr/bin/env node

/**
 * Install git pre-commit hook.
 * Runs automatically via `npm run prepare` (triggered by `npm install`).
 * Manual: node scripts/install-hooks.js
 */

const fs = require("fs");
const path = require("path");

const hooksDir = path.join(__dirname, "..", ".git", "hooks");
const hookFile = path.join(hooksDir, "pre-commit");
const sourceHook = path.join(__dirname, "pre-commit-hook.sh");

// Skip if not in a git repo
if (!fs.existsSync(path.join(__dirname, "..", ".git"))) {
  process.exit(0);
}

// Skip if no source hook
if (!fs.existsSync(sourceHook)) {
  console.log("⚠️  scripts/pre-commit-hook.sh not found, skipping hook install");
  process.exit(0);
}

// Create hooks dir if needed
if (!fs.existsSync(hooksDir)) {
  fs.mkdirSync(hooksDir, { recursive: true });
}

// Copy hook
fs.copyFileSync(sourceHook, hookFile);
fs.chmodSync(hookFile, 0o755);
console.log("✅ pre-commit hook installed");
