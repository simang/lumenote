# Lumenote frontmatter reference

Use this reference when editing Markdown notes for Lumenote publishing.

## Agent rules

- Do not publish a note unless the user explicitly asks to publish it.
- Use YAML frontmatter at the top of the file.
- Keep general metadata at root: `title`, `description`, `tags`.
- Put Lumenote settings only under `lumenote`.
- Never use root `publish`, `visibility`, or `slug`.
- Preserve existing frontmatter and body content unless a change is required.
- Keep existing `lumenote.slug` stable unless the user explicitly asks to change the URL.
- Do not publish credentials, tokens, private URLs, PII, daily notes, private drafts, or private meeting notes.

## Schema

```yaml
---
title: Human Readable Title
description: One sentence public summary.
tags:
  - guide
lumenote:
  publish: true
  visibility: public
  slug: human-readable-title
  canonical: https://example.com/human-readable-title
  theme: default
  nav: true
  backlinks: true
  comments: false
  access:
    password: null
    expires_at: null
    allowlist: []
---
```

## Minimal public note

```yaml
---
title: Human Readable Title
description: One sentence public summary.
lumenote:
  publish: true
  visibility: public
---
```

## Minimal unlisted note

```yaml
---
title: Human Readable Title
lumenote:
  publish: true
  visibility: unlisted
  nav: false
---
```

`unlisted` is not a security boundary. Anyone with the share link can access the note.

## Private note

```yaml
---
title: Private Draft
lumenote:
  publish: false
  visibility: private
---
```

## Unsupported root aliases

Do not write:

```yaml
---
publish: true
visibility: public
slug: wrong-example
---
```

Write:

```yaml
---
lumenote:
  publish: true
  visibility: public
  slug: correct-example
---
```
