process.env.NEXT_EXPORT = "true";
process.env.NODE_ENV = "production";
const { execSync } = require("child_process");
execSync("next build", {
  stdio: "inherit",
  env: { ...process.env, NEXT_EXPORT: "true", NODE_ENV: "production" },
});
