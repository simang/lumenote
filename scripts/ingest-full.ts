import { runFullSync } from "../src/lib/ingest";

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

const siteId = readArg("--site");
const ref = readArg("--ref");

if (!siteId) {
  throw new Error("Usage: npm run ingest:full -- --site site_123 [--ref main]");
}

const result = await runFullSync({
  siteId,
  ref,
  trigger: "manual",
});

console.log(JSON.stringify(result, null, 2));
