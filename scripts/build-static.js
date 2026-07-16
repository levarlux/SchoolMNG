const fs = require("fs");
const { execSync } = require("child_process");

process.env.NEXT_EXPORT = "true";
process.env.NODE_ENV = "production";

// .env.local overrides .env.production in Next.js.
// Temporarily move it aside so production keys take effect.
const envLocal = ".env.local";
const envLocalBackup = ".env.local.bak";
if (fs.existsSync(envLocal)) {
  fs.renameSync(envLocal, envLocalBackup);
}

try {
  execSync("next build", {
    stdio: "inherit",
    env: { ...process.env, NEXT_EXPORT: "true", NODE_ENV: "production" },
  });
} finally {
  if (fs.existsSync(envLocalBackup)) {
    fs.renameSync(envLocalBackup, envLocal);
  }
}
