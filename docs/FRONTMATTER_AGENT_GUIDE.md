# Lumenote Frontmatter Agent Guide

이 문서는 AI agent가 Tolaria/Markdown vault의 노트를 수정할 때 Lumenote publish용 frontmatter를 안전하고 일관되게 적용하기 위한 가이드다.

## Agent contract

AI agent는 다음 원칙을 지켜야 한다.

1. 사용자의 명시적 요청 없이 노트를 publish 상태로 바꾸지 않는다.
2. Lumenote 설정은 반드시 `lumenote.*` namespace 아래에만 작성한다.
3. root `publish`, `visibility`, `slug` alias는 사용하지 않는다.
4. 기존 frontmatter와 본문은 가능한 한 보존하고 필요한 필드만 최소 변경한다.
5. 개인 정보, credential, 내부 URL, access token, 사적인 daily note는 public으로 publish하지 않는다.
6. `lumenote.slug`는 한 번 공개된 뒤 임의로 바꾸지 않는다.
7. `lumenote.visibility: unlisted`는 비밀 보호 수단으로 취급하지 않는다.

## Supported frontmatter

Lumenote가 읽는 root metadata는 일반 Markdown metadata로 제한된다.

| Field | Type | Default | Agent guidance |
|---|---|---|---|
| `title` | string | 첫 H1 또는 파일명 | 사람이 읽는 페이지 제목으로 작성한다. |
| `description` | string | 없음 | 검색/미리보기용 1문장 요약으로 작성한다. |
| `tags` | string[] | `[]` | 필요한 경우 기존 태그를 보존하며 추가한다. |

Lumenote 전용 설정은 `lumenote` object 아래에만 작성한다.

| Field | Type | Default | Agent guidance |
|---|---|---|---|
| `lumenote.publish` | boolean | `false` | 공개 의도가 명확할 때만 `true`로 설정한다. |
| `lumenote.visibility` | `public`, `unlisted`, `private` | `public` | 일반 공개는 `public`, 링크 공유는 `unlisted`, 비공개는 `private`를 사용한다. |
| `lumenote.slug` | string | vault 상대 경로 기반 | 안정적인 URL이 필요할 때만 명시한다. |
| `lumenote.canonical` | string | 없음 | 외부 canonical URL이 있을 때만 설정한다. |
| `lumenote.theme` | string | `default` | 별도 지시가 없으면 생략하거나 `default`로 둔다. |
| `lumenote.nav` | boolean | `true` | 공개 탐색에 노출하지 않으려면 `false`로 설정한다. |
| `lumenote.backlinks` | boolean | `true` | backlink 영역을 숨기려면 `false`로 설정한다. |
| `lumenote.comments` | boolean | `false` | 댓글 기능을 켤 때만 `true`로 설정한다. |
| `lumenote.access.password` | string/null | `null` | MVP에서는 보안 수단으로 의존하지 않는다. |
| `lumenote.access.expires_at` | string/null | `null` | 만료 정책이 구현된 경로에서만 사용한다. |
| `lumenote.access.allowlist` | string[] | `[]` | allowlist enforcement가 확인된 경우에만 사용한다. |

## Publish decision policy

Agent는 publish 여부를 다음 기준으로 결정한다.

### Publish as public

다음 조건을 모두 만족할 때만 public publish를 설정한다.

- 사용자가 공개 페이지 생성을 요청했다.
- 노트에 credential, private key, token, password, internal endpoint가 없다.
- 개인 연락처, 주소, 계정 정보, 민감한 업무 내용이 없다.
- 링크된 노트가 비공개여도 본문만으로 의미가 유지된다.

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

Public note는 `/p/{site_slug}/{note_slug}` 경로에서 접근된다.

### Publish as unlisted

사용자가 "링크를 가진 사람만 보게 하고 싶다"고 요청하면 `unlisted`를 사용한다.

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

Unlisted note는 public navigation에 노출하지 않는 용도다. 링크를 받은 사람은 접근할 수 있으므로 민감 정보 보호 수단으로 사용하면 안 된다. 실제 share URL은 Lumenote의 share-link flow에서 생성된다.

### Keep private

다음 중 하나라도 해당하면 publish하지 않는다.

- 사용자가 공개를 요청하지 않았다.
- 노트가 draft, journal, daily note, meeting note, TODO, private research 성격이다.
- credential, token, private URL, 고객 정보, 개인 정보가 포함되어 있다.
- agent가 공개 가능 여부를 확신할 수 없다.

```yaml
---
title: Private Draft
lumenote:
  publish: false
  visibility: private
---
```

## Slug rules

Agent는 slug를 URL 안정성 기준으로 다룬다.

- `lumenote.slug`가 없으면 vault 상대 path를 기반으로 URL path가 생성된다.
- 명시 slug는 lowercase, hyphen-separated 형태를 권장한다.
- 공백과 특수문자는 피한다.
- 이미 공개된 노트의 slug는 사용자가 요청하지 않으면 변경하지 않는다.
- 같은 site 안에서 slug가 중복되면 ingest error가 발생할 수 있다.

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

## How to edit a note

Agent는 다음 순서로 frontmatter를 수정한다.

1. 파일 맨 위에 YAML frontmatter block이 있는지 확인한다.
2. 기존 frontmatter가 있으면 값을 보존하고 필요한 필드만 merge한다.
3. 기존 frontmatter가 없으면 파일 맨 위에 `---` block을 추가한다.
4. root에는 `title`, `description`, `tags`만 필요한 만큼 둔다.
5. Lumenote 설정은 `lumenote` object 아래에 둔다.
6. YAML boolean은 문자열이 아니라 `true`/`false`로 작성한다.
7. 변경 후 frontmatter와 본문 사이에 빈 줄을 하나 둔다.

기존 frontmatter가 없는 노트:

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

기존 frontmatter를 보존하는 노트:

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

위 예시에서 `created`는 Lumenote가 직접 사용하지 않지만, 다른 vault tooling을 위해 보존한다.

## Do not use root aliases

다음 형태는 Lumenote MVP에서 지원하지 않는다.

```yaml
---
title: Wrong Example
publish: true
visibility: public
slug: wrong-example
---
```

반드시 다음처럼 작성한다.

```yaml
---
title: Correct Example
lumenote:
  publish: true
  visibility: public
  slug: correct-example
---
```

## Agent prompt snippet

Vault를 수정하는 AI agent에는 다음 지시문을 사용할 수 있다.

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

## Direct refresh without GitHub Actions

Vault repository에 Lumenote GitHub Action이 없으면 AI agent가 Lumenote API를 직접 호출해 변경 사항을 갱신할 수 있다.

배포 가능한 skill:

```text
skills/lumenote-publisher
```

이 skill은 다음을 수행한다.

1. `git diff --name-status {before} {after}`로 Markdown과 supported asset 변경 path를 계산한다.
2. repository owner, repo, branch, commit SHA를 payload로 만든다.
3. `POST /api/ingest/changed-paths`를 호출한다.
4. 파일 내용은 보내지 않는다. Lumenote가 GitHub App으로 GitHub에서 직접 읽는다.

필요한 환경 변수:

```bash
export LUMENOTE_API_URL="https://your-lumenote-app.example.com"
export LUMENOTE_SITE_ID="site_xxx"
export LUMENOTE_INGEST_TOKEN="..."
```

vault repository root에서 실행한다.

```bash
node /path/to/skills/lumenote-publisher/scripts/lumenote-refresh.mjs \
  --before HEAD~1 \
  --after HEAD
```

주의사항:

- `after` commit은 GitHub에 push되어 있어야 한다.
- local uncommitted change는 Lumenote가 읽을 수 없다.
- 새 site의 최초 ingestion은 admin full sync로 bootstrap하는 것이 안전하다.
- 여러 commit을 한 번에 갱신하려면 가장 오래된 unsynced base SHA를 `--before`, 최신 pushed SHA를 `--after`로 넘긴다.
- ingest token은 CLI 인자보다 환경 변수로 전달한다.

## Pre-publish checklist

Agent는 `lumenote.publish: true`를 설정하기 전에 확인한다.

- [ ] 사용자가 이 노트를 publish하라고 명시했다.
- [ ] frontmatter가 YAML로 파싱 가능하다.
- [ ] Lumenote 설정이 `lumenote.*` 아래에 있다.
- [ ] root `publish`, `visibility`, `slug`가 없다.
- [ ] `title` 또는 첫 H1이 사람이 읽기 좋은 제목이다.
- [ ] `description`에 비밀 정보가 없다.
- [ ] 본문에 credential, token, password, private key가 없다.
- [ ] 링크된 private note가 공개 본문에 민감한 맥락을 노출하지 않는다.
- [ ] slug가 기존 공개 URL을 불필요하게 변경하지 않는다.
- [ ] unlisted를 보안 경계로 오해하지 않는다.

## Minimal safe defaults

공개 요청이 명확하지만 세부 설정이 없으면 다음 형태를 기본값으로 사용한다.

```yaml
---
title: Human Readable Title
description: One sentence summary for public readers.
lumenote:
  publish: true
  visibility: public
---
```

slug는 안정적인 URL이 필요하거나 사용자가 원하는 URL을 지정한 경우에만 추가한다.
