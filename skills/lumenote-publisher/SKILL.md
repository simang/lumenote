---
name: lumenote-publisher
description: Publish or refresh Lumenote Markdown vault changes from an AI agent without requiring a GitHub Actions workflow. Use when Codex is editing a Tolaria/Markdown vault, applying Lumenote frontmatter, committing/pushing vault changes, manually notifying Lumenote through POST /api/ingest/changed-paths, or troubleshooting direct Lumenote ingest API calls with LUMENOTE_API_URL, LUMENOTE_SITE_ID, and LUMENOTE_INGEST_TOKEN.
---

# Lumenote Publisher

Use this skill to update Lumenote after an agent changes a vault repository and the vault does not have the Lumenote GitHub Action installed.

## Core workflow

1. Edit Markdown notes using the Lumenote frontmatter rules.
2. Commit and push the vault changes to GitHub.
3. Notify Lumenote with the committed `before` and `after` SHAs.
4. Verify the Lumenote ingest response.

Do not send file contents to Lumenote. The changed-paths API only receives repository metadata, commit SHAs, and changed paths. Lumenote reads file contents through its GitHub App installation.

## Required environment

Set these in the shell or agent environment:

```bash
export LUMENOTE_API_URL="https://your-lumenote-app.example.com"
export LUMENOTE_SITE_ID="site_xxx"
export LUMENOTE_INGEST_TOKEN="..."
```

Optional:

```bash
export LUMENOTE_BRANCH="main"
```

Prefer environment variables over command-line token arguments so secrets do not enter shell history.

## Direct refresh script

From the vault repository root, run:

```bash
node /path/to/lumenote-publisher/scripts/lumenote-refresh.mjs \
  --before HEAD~1 \
  --after HEAD
```

If the branch or repository cannot be inferred:

```bash
node /path/to/lumenote-publisher/scripts/lumenote-refresh.mjs \
  --repo owner/repo \
  --branch main \
  --before HEAD~1 \
  --after HEAD
```

Preview the payload without calling Lumenote:

```bash
node /path/to/lumenote-publisher/scripts/lumenote-refresh.mjs \
  --before HEAD~1 \
  --after HEAD \
  --dry-run
```

The script filters changes to Markdown and supported assets:

- `.md`
- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.webp`
- `.svg`

## Important constraints

- The `after` SHA must exist in the GitHub repository and be reachable from the configured branch.
- Uncommitted local changes cannot be ingested because Lumenote reads from GitHub.
- If this is the first connection for a site, run a full sync from Lumenote admin before relying on changed-path ingest.
- If multiple commits need syncing, pass the oldest unsynced base SHA as `--before` and the latest pushed SHA as `--after`.
- If the working tree is dirty, commit first. Use `--allow-dirty` only when intentionally refreshing already-pushed commits.

## Frontmatter reference

Read `references/frontmatter.md` before adding or modifying `lumenote.*` frontmatter.

Key rules:

- Set `lumenote.publish: true` only when the user explicitly asks to publish.
- Use `lumenote.visibility: public` for public pages.
- Use `lumenote.visibility: unlisted` for share-link pages, not as a security boundary.
- Never use root `publish`, `visibility`, or `slug`.
- Preserve existing `title`, `description`, `tags`, and other vault metadata unless the user asks to change them.
