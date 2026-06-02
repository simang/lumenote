import { execFileSync } from "node:child_process";

const supportedPattern = /\.(md|png|jpe?g|gif|webp|svg)$/i;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseNameStatusLine(line) {
  const parts = line.split("\t");
  const rawStatus = parts[0];
  const statusCode = rawStatus[0];

  if (statusCode === "R") {
    return {
      status: "renamed",
      previous_path: parts[1],
      path: parts[2],
    };
  }

  if (statusCode === "A") {
    return { status: "added", path: parts[1] };
  }

  if (statusCode === "D") {
    return { status: "deleted", path: parts[1] };
  }

  return { status: "modified", path: parts[1] };
}

const before = requiredEnv("BEFORE");
const after = requiredEnv("AFTER");
const apiUrl = requiredEnv("LUMENOTE_API_URL").replace(/\/$/, "");
const ingestToken = requiredEnv("LUMENOTE_INGEST_TOKEN");
const siteId = requiredEnv("LUMENOTE_SITE_ID");

const diff = execFileSync("git", ["diff", "--name-status", before, after], {
  encoding: "utf8",
});

const changes = diff
  .split("\n")
  .filter(Boolean)
  .map(parseNameStatusLine)
  .filter((change) => {
    if (change.status === "renamed") {
      return supportedPattern.test(change.path) || supportedPattern.test(change.previous_path);
    }
    return supportedPattern.test(change.path);
  });

const repository = {
  owner: process.env.GITHUB_REPOSITORY_OWNER,
  repo: process.env.GITHUB_REPOSITORY?.split("/")[1],
  branch: process.env.GITHUB_REF_NAME,
};

const response = await fetch(`${apiUrl}/api/ingest/changed-paths`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${ingestToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    site_id: siteId,
    repository,
    before,
    after,
    changes,
  }),
});

if (!response.ok) {
  const text = await response.text();
  throw new Error(`Lumenote ingest failed: ${response.status} ${text}`);
}

console.log(await response.text());
