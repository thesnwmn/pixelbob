import { execSync } from "node:child_process";
import { defineConfig } from "vite";

// The commit the build is from, for the feedback report: CI's, or the checkout's.
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  base: "./",
  server: { port: 5184, strictPort: true },
  define: { __COMMIT__: JSON.stringify(commit()) },
});
