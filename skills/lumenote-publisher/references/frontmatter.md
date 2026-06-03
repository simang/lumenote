# Lumenote frontmatter reference

Use this reference when editing Markdown notes for Lumenote publishing.

## Agent contract

- Do not publish a note unless the user explicitly asks to publish it.
- Put Lumenote settings only under `lumenote`.
- Never use root `publish`, `visibility`, or `slug`.
- Preserve existing frontmatter and body content unless a change is required.
- Preserve non-Lumenote vault metadata such as `created`, `updated`, aliases, and app-specific fields.
- Keep existing `lumenote.slug` stable unless the user explicitly asks to change the URL.
- Do not publish credentials, tokens, private URLs, PII, daily notes, private drafts, or private meeting notes.
- Treat `lumenote.visibility: unlisted` as link discoverability control, not as a security boundary.

## Supported fields

Lumenote reads only these root metadata fields:

| Field | Type | Default | Guidance |
|---|---|---|---|
| `title` | string | First H1 or filename | Use a human-readable page title. |
| `description` | string | none | Use a one-sentence public summary. |
| `tags` | string[] | `[]` | Preserve existing tags; add only when useful. |

Lumenote-specific settings must be nested under `lumenote`:

| Field | Type | Default | Guidance |
|---|---|---|---|
| `lumenote.publish` | boolean | `false` | Set `true` only for explicit publish requests. |
| `lumenote.visibility` | `public`, `unlisted`, `private` | `public` | Use `public` for public pages, `unlisted` for link-only pages, `private` for non-public notes. |
| `lumenote.slug` | string | vault-relative path | Add only when a stable custom URL is needed. |
| `lumenote.canonical` | string | none | Add only when an external canonical URL exists. |
| `lumenote.theme` | string | `default` | Omit unless the user requests a theme. |
| `lumenote.nav` | boolean | `true` | Set `false` to hide from public navigation. |
| `lumenote.backlinks` | boolean | `true` | Set `false` to hide backlink sections. |
| `lumenote.comments` | boolean | `false` | Set `true` only when comments are requested. |
| `lumenote.access.password` | string/null | `null` | Do not rely on this as an MVP security boundary. |
| `lumenote.access.expires_at` | string/null | `null` | Use only when expiration handling is confirmed. |
| `lumenote.access.allowlist` | string[] | `[]` | Use only when allowlist enforcement is confirmed. |

## Publish decision policy

### Public

Use public publishing only when all conditions are true:

- The user asked to create or update a public page.
- The note contains no credentials, private keys, tokens, passwords, or internal endpoints.
- The note contains no private personal data, customer data, or sensitive work content.
- The note remains meaningful even if linked private notes are not accessible.

```yaml
---
title: Example Public Note
description: A concise public summary.
tags:
  - guide
  - public
lumenote:
  publish: true
  visibility: public
  slug: example-public-note
---
```

### Unlisted

Use `unlisted` when the user wants a link-only page.

```yaml
---
title: Example Unlisted Note
lumenote:
  publish: true
  visibility: unlisted
  slug: example-unlisted-note
  nav: false
---
```

Anyone with the link may access an unlisted note. Do not use it for secrets.

### Private

Keep the note private when the user did not request publication, or when safety is uncertain.

```yaml
---
title: Private Draft
lumenote:
  publish: false
  visibility: private
---
```

## Slug rules

- If `lumenote.slug` is absent, Lumenote derives the URL path from the vault-relative file path.
- Prefer lowercase, hyphen-separated slugs.
- Avoid spaces and decorative punctuation.
- Do not change an existing public slug unless the user asks to change the URL.
- Duplicate slugs in the same site can cause ingest errors.

Good:

```yaml
lumenote:
  slug: product/launch-notes
```

Avoid:

```yaml
lumenote:
  slug: "Launch Notes!!!"
```

## Editing workflow

1. Check whether the Markdown file already has a YAML frontmatter block at the top.
2. If frontmatter exists, merge only the needed fields.
3. If frontmatter does not exist, add a `---` block at the top.
4. Keep root metadata limited to general metadata such as `title`, `description`, and `tags`.
5. Put all Lumenote settings under `lumenote`.
6. Write YAML booleans as `true` or `false`, not strings.
7. Leave one blank line between frontmatter and body.

No existing frontmatter:

```markdown
---
title: Public Guide
description: A short guide for readers.
lumenote:
  publish: true
  visibility: public
  slug: public-guide
---

# Public Guide

Body starts here.
```

Existing frontmatter:

```markdown
---
title: Existing Note
tags:
  - research
  - guide
created: 2026-06-03
lumenote:
  publish: true
  visibility: public
  slug: existing-note
---
```

The `created` field is preserved for vault tooling even though Lumenote does not use it.

## Unsupported root aliases

Do not write:

```yaml
---
title: Wrong Example
publish: true
visibility: public
slug: wrong-example
---
```

Write:

```yaml
---
title: Correct Example
lumenote:
  publish: true
  visibility: public
  slug: correct-example
---
```

## Prompt snippet for vault agents

```text
When editing Markdown notes for Lumenote:
- Only publish notes when the user explicitly requests publication.
- Use YAML frontmatter at the top of the file.
- Keep general metadata at root: title, description, tags.
- Put Lumenote settings only under the lumenote object.
- Never use root publish, visibility, or slug fields.
- Preserve existing frontmatter and note body unless a change is required.
- Set lumenote.publish: true only for notes safe for public or unlisted web access.
- Use lumenote.visibility: public for public pages and unlisted for share-link pages.
- Do not publish notes containing credentials, tokens, private URLs, PII, daily notes, or private drafts.
- Keep existing lumenote.slug stable unless the user explicitly asks to change the URL.
```

## Pre-publish checklist

- [ ] The user explicitly asked to publish this note.
- [ ] YAML frontmatter is parseable.
- [ ] Lumenote settings are under `lumenote`.
- [ ] Root `publish`, `visibility`, and `slug` are absent.
- [ ] `title` or the first H1 is human-readable.
- [ ] `description` contains no secrets.
- [ ] The body contains no credentials, tokens, passwords, or private keys.
- [ ] Links to private notes do not expose sensitive context in the public body.
- [ ] The slug does not unnecessarily change an existing public URL.
- [ ] `unlisted` is not being used as a security boundary.
