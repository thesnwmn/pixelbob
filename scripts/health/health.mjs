// `pnpm health [--quick] [--end] [--json]`: is this repo ready to develop on?
// Plain JS so it can say why when Node is too old to run the .ts checks at all.
import { fileURLToPath } from "node:url";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.log(`  ✗ tools/node  ${process.version}: the health check needs Node 22.18 or later (see .nvmrc)`);
  process.exit(1);
}

const { main } = await import("./src/run.ts");
process.exitCode = main(process.argv.slice(2), fileURLToPath(new URL("../..", import.meta.url)));
