# Lumenote

Lumenote는 Tolaria Markdown vault에서 선택된 노트만 웹 페이지로 publish하는 서비스입니다. GitHub repository를 read-only로 읽고, frontmatter 설정에 따라 공개 페이지와 unlisted share link를 제공합니다.

제품 요구사항과 구현 설계는 다음 문서를 기준으로 합니다.

- `docs/SPEC.md`
- `docs/DESIGN.md`

AI agent가 vault frontmatter를 수정하거나 GitHub Action 없이 직접 ingest API를 호출할 때 사용할 수 있는 배포 가능한 skill은 다음 경로에 있습니다.

- `skills/lumenote-publisher`

## 현재 구현 범위

- Next.js App Router 기반 앱
- Supabase/Postgres 호환 DB schema와 migration
- GitHub App installation token 기반 repository file fetch
- GitHub Action changed-path ingestion API
- Admin password session
- Markdown/frontmatter/wikilink parser
- Sanitized HTML materialized note store
- Public route: `/p/{site_slug}/{note_slug}`
- Share route: `/s/{share_token}`
- Asset proxy route: `/assets/{site_id}/{source_sha}/{asset_path}`
- Minimal admin dashboard, full sync, share-link generation

## 요구사항

- Node.js 20 이상 권장
- npm
- Postgres database
- GitHub App
  - Repository metadata: read-only
  - Repository contents: read-only

## 설치

```bash
npm install
cp .env.example .env
```

`.env`에 필요한 값을 설정합니다.

```env
DATABASE_URL=
NEXT_PUBLIC_APP_URL=http://localhost:3000

GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_WEBHOOK_SECRET=
LUMENOTE_INGEST_TOKEN=

ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=
ADMIN_SESSION_SECRET=

OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=
OBJECT_STORAGE_BUCKET=
```

`ADMIN_PASSWORD_HASH`는 bcrypt hash여야 합니다. raw password는 저장하지 않습니다.

## DB migration

```bash
npm run db:migrate
```

Migration은 `db/migrations` 아래 SQL 파일을 순서대로 적용합니다.

## 개발 서버

```bash
npm run dev
```

Admin UI는 다음 경로에서 접근합니다.

```text
http://localhost:3000/admin
```

## 기본 운영 흐름

1. GitHub App을 vault repository에 설치합니다.
2. `.env`에 GitHub App, DB, admin 값을 설정합니다.
3. `npm run db:migrate`로 DB schema를 적용합니다.
4. `/admin`에서 site 설정을 저장합니다.
5. Admin UI에서 full sync를 실행하거나 CLI로 실행합니다.
6. Vault repository에 GitHub Action template을 추가해 변경 path ingestion을 연결합니다.

## Full sync

Admin UI에서 실행하거나 CLI로 실행할 수 있습니다.

```bash
npm run ingest:full -- --site site_123
npm run ingest:full -- --site site_123 --ref main
```

Full sync는 repository tree를 읽고, Markdown과 supported asset만 ingestion 대상으로 처리합니다.

## GitHub Action template

Vault repository에 다음 파일을 복사합니다.

```text
templates/github/lumenote.yml -> .github/workflows/lumenote.yml
templates/github/lumenote-changes.mjs -> .github/scripts/lumenote-changes.mjs
```

Vault repository secret을 설정합니다.

```text
LUMENOTE_API_URL
LUMENOTE_INGEST_TOKEN
LUMENOTE_SITE_ID
```

Action은 push diff에서 Markdown과 supported asset path만 추출한 뒤 `POST /api/ingest/changed-paths`를 호출합니다. 파일 내용은 Action payload에 포함하지 않습니다.

GitHub Action이 없는 vault repository에서는 `skills/lumenote-publisher` skill을 사용해 AI agent가 같은 API를 직접 호출할 수 있습니다.

## Frontmatter

Lumenote 전용 설정은 `lumenote.*` namespace만 사용합니다. MVP에서는 root `publish`, `visibility`, `slug` alias를 지원하지 않습니다.

```yaml
title: My Note
description: Short page description
tags:
  - product
  - note
lumenote:
  publish: true
  visibility: public
  slug: my-note
  canonical: https://example.com/my-note
  theme: default
  nav: true
  backlinks: true
  comments: false
  access:
    password: null
    expires_at: null
    allowlist: []
```

## 지원하는 content

- CommonMark/GFM Markdown
- Frontmatter 제거 후 렌더링
- Table, task list, footnote
- Heading anchor
- Code highlighting
- Wikilink
  - `[[Note]]`
  - `[[Note|Label]]`
  - `[[folder/Note]]`
  - `![[image.png]]`
- Markdown image asset rewrite
- Backlink/outgoing link graph 저장

Publish되지 않은 내부 링크는 public HTML에서 링크를 만들지 않고 표시 텍스트만 유지합니다.

## 주요 route

```text
GET  /admin
POST /api/admin/login
POST /api/admin/logout
POST /api/admin/sites
POST /api/admin/share-links

POST /api/ingest/changed-paths
POST /api/ingest/full-sync

GET  /p/{site_slug}/{note_slug}
GET  /s/{share_token}
GET  /assets/{site_id}/{source_sha}/{asset_path}
```

## 명령어

```bash
npm run dev
npm run build
npm run start
npm run db:migrate
npm run ingest:full -- --site site_123
npm run test
```

## 검증

```bash
npm run test
npm run build
npm audit
```

## 보안 원칙

- GitHub repository는 read-only 권한으로만 접근합니다.
- GitHub Action payload에는 파일 내용을 포함하지 않습니다.
- Ingest API는 bearer token을 검증합니다.
- Markdown HTML은 sanitize 후 저장합니다.
- Unlisted share token은 raw value를 DB에 저장하지 않고 hash만 저장합니다.
- Unpublished/private note의 링크는 public output에서 활성 링크로 노출하지 않습니다.

## MVP 이후 작업

- Supabase Storage 직접 업로드 연동
- Password protected page
- Email/domain allowlist
- Sitemap/RSS
- Full-text search
- Custom domain
- GitHub webhook managed mode
- Theme customization
