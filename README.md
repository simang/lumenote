<p align="center">
  <img src="public/logo.png" alt="Lumenote logo" width="160" />
</p>

# Lumenote

Lumenote는 Tolaria Markdown vault에서 선택된 노트만 웹 페이지로 publish하는 서비스입니다. GitHub repository를 read-only로 읽고, frontmatter 설정에 따라 공개 페이지와 unlisted share link를 제공합니다.

제품 요구사항과 구현 설계는 다음 문서를 기준으로 합니다.

- `docs/SPEC.md`
- `docs/DESIGN.md`

AI agent가 vault frontmatter를 수정하거나 직접 ingest API를 호출할 때 사용할 수 있는 배포 가능한 skill은 다음 경로에 있습니다.

- `skills/lumenote-publisher`

## 현재 구현 범위

- Next.js App Router 기반 앱
- Supabase/Postgres 호환 DB schema와 migration
- GitHub App installation token 기반 repository file fetch
- Agent/API changed-path ingestion API
- User password session
- Markdown/frontmatter/wikilink parser
- Sanitized HTML materialized note store
- Public route: `/p/{site_slug}/{note_slug}`
- Share route: `/s/{share_token}`
- Asset proxy route: `/assets/{site_id}/{source_sha}/{asset_path}`
- User dashboard, full sync, share-link generation and revocation

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
GITHUB_APP_SLUG=
GITHUB_APP_INSTALL_URL=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_WEBHOOK_SECRET=
LUMENOTE_INGEST_TOKEN=

BOOTSTRAP_USER_EMAIL=
BOOTSTRAP_USER_PASSWORD_HASH=
AUTH_SESSION_SECRET=
SHARE_TOKEN_ENCRYPTION_SECRET=
INGEST_TOKEN_ENCRYPTION_SECRET=
ALLOW_PUBLIC_SIGNUP=false

OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=
OBJECT_STORAGE_BUCKET=
```

`BOOTSTRAP_USER_PASSWORD_HASH`는 bcrypt hash여야 합니다. raw password는 저장하지 않습니다. 최초 사용자 bootstrap login에 사용됩니다. 추가 사용자 가입은 `ALLOW_PUBLIC_SIGNUP=true`일 때만 허용됩니다.

기존 배포 호환을 위해 `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`도 fallback으로 읽습니다. 새 배포에서는 `BOOTSTRAP_USER_EMAIL`, `BOOTSTRAP_USER_PASSWORD_HASH`, `AUTH_SESSION_SECRET`을 사용하세요.

`SHARE_TOKEN_ENCRYPTION_SECRET`은 dashboard에서 생성된 unlisted URL을 다시 보여주기 위한 암호화 키입니다. 설정하지 않으면 `AUTH_SESSION_SECRET`을 fallback으로 사용합니다. 기존에 hash만 저장된 share link URL은 복구할 수 없으므로 새 URL을 생성해야 합니다.

`INGEST_TOKEN_ENCRYPTION_SECRET`은 site별 agent ingest token을 dashboard에서 다시 보여주기 위한 암호화 키입니다. 설정하지 않으면 `SHARE_TOKEN_ENCRYPTION_SECRET` 또는 `AUTH_SESSION_SECRET`을 fallback으로 사용합니다. `LUMENOTE_INGEST_TOKEN`은 site token이 아직 발급되지 않은 site를 위한 legacy fallback입니다.

## DB migration

```bash
npm run db:migrate
```

Migration은 `db/migrations` 아래 SQL 파일을 순서대로 적용합니다.

## 개발 서버

```bash
npm run dev
```

Dashboard는 다음 경로에서 접근합니다.

```text
http://localhost:3000/dashboard
```

## 기본 운영 흐름

1. `.env`에 GitHub App, DB, auth 값을 설정합니다.
2. `npm run db:migrate`로 DB schema를 적용합니다.
3. 최초 사용자는 `BOOTSTRAP_USER_EMAIL`/bootstrap password로 로그인해 user account를 bootstrap합니다.
4. `/dashboard`에서 GitHub App을 설치하고 repository를 site로 등록합니다.
5. `/dashboard/sites/{site_id}`에서 site-specific ingest token을 발급합니다.
6. Dashboard에서 full sync를 실행하거나 CLI로 실행합니다.
7. AI agent skill 또는 외부 API client로 변경 path ingestion을 trigger합니다.

GitHub App 설정의 Setup URL은 다음 경로로 지정합니다.

```text
{NEXT_PUBLIC_APP_URL}/api/github/installations/callback
```

`GITHUB_APP_SLUG`는 `https://github.com/apps/{slug}`의 `{slug}` 값입니다. 직접 install URL을 쓰고 싶으면 `GITHUB_APP_INSTALL_URL`을 설정합니다.

## Full sync

Dashboard에서 실행하거나 CLI로 실행할 수 있습니다.

```bash
npm run ingest:full -- --site site_123
npm run ingest:full -- --site site_123 --ref main
```

Full sync는 repository tree를 읽고, Markdown과 supported asset만 ingestion 대상으로 처리합니다.

## Agent/API ingest trigger

Vault repository의 commit/push 이후, AI agent나 외부 도구가 변경 commit 기준으로 ingest를 trigger할 수 있습니다.

배포 가능한 Codex skill:

```bash
skills/lumenote-publisher
```

필요한 환경 변수:

```bash
LUMENOTE_API_URL
LUMENOTE_SITE_ID
LUMENOTE_SITE_TOKEN
```

Skill은 `git diff --name-status {before} {after}`로 Markdown과 supported asset 변경 path만 추출한 뒤 `POST /api/ingest/changed-paths`를 호출합니다. 파일 내용은 API payload에 포함하지 않습니다.
`LUMENOTE_INGEST_TOKEN`은 기존 배포 호환용 fallback으로만 사용합니다.

웹에서는 `/dashboard`의 full sync 버튼으로 사용자가 직접 전체 갱신을 trigger할 수 있습니다.

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
GET  /dashboard
GET  /dashboard/sites/{site_id}
GET  /login
GET  /signup
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/signup
POST /api/sites
POST /api/sites/ingest-token
POST /api/share-links
POST /api/share-links/manage

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
- Ingest API payload에는 파일 내용을 포함하지 않습니다.
- Ingest API는 bearer token을 검증합니다.
- Markdown HTML은 sanitize 후 저장합니다.
- Unlisted share token은 조회용 hash와 dashboard 복구용 encrypted token으로 저장합니다.
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
