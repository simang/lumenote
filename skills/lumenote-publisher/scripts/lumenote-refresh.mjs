#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const supportedPattern = /\.(md|png|jpe?g|gif|webp|svg)$/i;

function usage() {
  console.log(`Usage:
  lumenote-refresh.mjs --before <rev> --after <rev> [options]

Options:
  --api-url <url>       Defaults to LUMENOTE_API_URL
  --site <site_id>      Defaults to LUMENOTE_SITE_ID
  --token <token>       Defaults to LUMENOTE_SITE_TOKEN, then legacy LUMENOTE_INGEST_TOKEN
  --repo <owner/repo>   Defaults to GITHUB_REPOSITORY or git remote origin
  --branch <branch>     Defaults to LUMENOTE_BRANCH, GITHUB_REF_NAME, or current branch
  --before <rev>        Base git revision to diff from
  --after <rev>         Target git revision to ingest
  --dry-run             Print payload without calling Lumenote
  --allow-dirty         Do not fail on local uncommitted changes
  --help                Show this help
`);
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--allow-dirty") {
      options.allowDirty = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function gitMaybe(args) {
  try {
    return git(args);
  } catch {
    return undefined;
  }
}

function parseRemoteOrigin() {
  const remote = gitMaybe(["config", "--get", "remote.origin.url"]);
  if (!remote) {
    return undefined;
  }

  const sshMatch = remote.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const httpsMatch = remote.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return undefined;
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

  if (statusCode === "A" || statusCode === "C") {
    return { status: "added", path: statusCode === "C" ? parts[2] : parts[1] };
  }

  if (statusCode === "D") {
    return { status: "deleted", path: parts[1] };
  }

  return { status: "modified", path: parts[1] };
}

function isSupportedChange(change) {
  if (change.status === "renamed") {
    return supportedPattern.test(change.path) || supportedPattern.test(change.previous_path);
  }

  return supportedPattern.test(change.path);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty && !options.allowDirty) {
    throw new Error("Working tree has uncommitted changes. Commit first or pass --allow-dirty.");
  }

  const apiUrl = required(options.apiUrl ?? process.env.LUMENOTE_API_URL, "LUMENOTE_API_URL").replace(/\/$/, "");
  const siteId = required(options.site ?? process.env.LUMENOTE_SITE_ID, "LUMENOTE_SITE_ID");
  const ingestToken = required(
    options.token ?? process.env.LUMENOTE_SITE_TOKEN ?? process.env.LUMENOTE_INGEST_TOKEN,
    "LUMENOTE_SITE_TOKEN",
  );
  const before = git(["rev-parse", required(options.before ?? process.env.BEFORE, "--before")]);
  const after = git(["rev-parse", required(options.after ?? process.env.AFTER, "--after")]);
  const repositoryFullName = required(
    options.repo ?? process.env.GITHUB_REPOSITORY ?? parseRemoteOrigin(),
    "--repo or GITHUB_REPOSITORY",
  );
  const [owner, repo] = repositoryFullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repository format: ${repositoryFullName}`);
  }

  const branch = required(
    options.branch ??
      process.env.LUMENOTE_BRANCH ??
      process.env.GITHUB_REF_NAME ??
      gitMaybe(["rev-parse", "--abbrev-ref", "HEAD"]),
    "--branch or LUMENOTE_BRANCH",
  );

  const diff = git(["diff", "--name-status", before, after]);
  const changes = diff
    .split("\n")
    .filter(Boolean)
    .map(parseNameStatusLine)
    .filter(isSupportedChange);

  const payload = {
    site_id: siteId,
    repository: { owner, repo, branch },
    before,
    after,
    changes,
  };

  if (options.dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const response = await fetch(`${apiUrl}/api/ingest/changed-paths`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Lumenote ingest failed: ${response.status} ${text}`);
  }

  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
