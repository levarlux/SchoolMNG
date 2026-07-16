process.env.NEXT_EXPORT = "true";
const { execSync } = require("child_process");
execSync("next build", { stdio: "inherit", env: { ...process.env, NEXT_EXPORT: "true" } });
