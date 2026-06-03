# Lumenote Design

## 상태

이 문서는 Lumenote MVP의 구현 설계를 정의한다. 제품 요구사항은 [`SPEC.md`](SPEC.md)가 기준이고, 이 문서는 실제 앱을 어떤 컴포넌트와 데이터 흐름으로 만들지 결정한다.

현재 MVP는 하나의 Lumenote 배포에서 여러 사용자가 각자의 GitHub App installation과 site를 등록하는 멀티 테넌트 운영을 전제로 한다. Vercel은 Lumenote 앱 자체를 호스팅하는 플랫폼으로 사용하고, 사용자별 Vercel 권한 위임이나 site별 Vercel 배포는 MVP에서 제외한다.

## 핵심 결정

| 항목 | 결정 |
|---|---|
| 앱 호스팅 | Vercel에 Lumenote Next.js 앱을 1개 배포 |
| vault 접근 | GitHub App installation token으로 repository contents read |
| 업데이트 트리거 | Dashboard full sync job 또는 AI agent/API client가 changed paths를 Lumenote API에 전달 |
| 파일 내용 전달 | ingest trigger는 파일 내용을 보내지 않고 path/status/commit만 보낸다 |
| 노트 serving | Lumenote 앱이 materialized note store에서 직접 제공 |
| Vercel OAuth | MVP 제외 |
| 사용자 모델 | password auth 사용자 + 사용자별 site ownership |
| 공개 URL | MVP는 path-based URL, 이후 subdomain/custom domain |
| 저장소 | Supabase Postgres + Supabase Storage |
| Auth | password session, optional public signup, bootstrap user env |
| Render store | sanitized HTML materialization |

## 전체 구조

```text
Tolaria vault repository
  -> User dashboard sync trigger or AI agent/API trigger
  -> queue full sync job or POST /api/ingest/changed-paths
  -> Lumenote ingestion service
  -> GitHub App reads changed files at commit SHA
  -> Markdown/frontmatter/wikilink parser
  -> Postgres materialized note store
  -> Object storage for published assets
  -> Public routes served by Lumenote on Vercel
```

## MVP 런타임

### Next.js app

- App Router 기반으로 구현한다.
- `/api/*`는 ingestion, auth, user-owned resource API를 담당한다.
- public page route는 DB에 저장된 렌더링 결과를 읽어 응답한다.
- Markdown parsing/rendering은 request path에서 직접 수행하지 않고 ingestion 단계에서 materialize한다.

### Supabase Postgres

MVP DB는 Supabase Postgres를 사용한다. Postgres는 다음 데이터를 저장한다.

- site 설정
- GitHub repository 연결 정보
- note metadata
- rendered note content
- link graph
- share link
- ingestion run log

앱 코드는 Supabase client에 과하게 묶지 않고 Postgres SQL/ORM 위주로 둔다. 이렇게 하면 나중에 Neon, Vercel Postgres, self-hosted Postgres로 옮기는 비용을 줄일 수 있다.

### Supabase Storage

private vault의 asset은 브라우저가 GitHub raw URL로 직접 접근할 수 없다. publish된 이미지와 첨부 파일은 Lumenote가 GitHub에서 읽어 object storage에 저장하거나, MVP에서는 authenticated proxy + cache로 제공한다.

MVP asset storage는 Supabase Storage를 사용한다.

1. 이미지 asset은 ingestion 단계에서 object storage에 저장한다.
2. note HTML에는 Lumenote asset URL을 넣는다.
3. publish되지 않은 note가 참조하는 asset은 공개하지 않는다.

### Rendered content

MVP에서는 Markdown을 ingestion 단계에서 sanitized HTML로 렌더링하고 `notes.html`에 저장한다. 요청 시점에는 HTML shell, note metadata, link graph, access policy만 조합한다.

AST/JSON document 저장은 MVP 이후로 미룬다. 나중에 block-level rendering, interactive embeds, theme-specific renderer가 필요해지면 `notes.render_ast` 또는 별도 table을 추가한다.

## URL 설계

MVP는 route 충돌과 subdomain 설정 부담을 줄이기 위해 path-based URL을 쓴다.

```text
https://lumenote.example.com/p/{site_slug}/{note_slug}
https://lumenote.example.com/s/{share_token}
```

나중에 다음 URL을 추가한다.

```text
https://{site_slug}.lumenote.dev/{note_slug}
https://notes.example.com/{note_slug}
```

예약 path:

- `/api`
- `/dashboard`
- `/login`
- `/signup`
- `/p`
- `/s`
- `/_next`

## Dashboard UI

MVP dashboard UI는 제품형 onboarding보다 운영 도구에 가깝게 만든다.

필요 화면:

- login
- site 설정
- GitHub App 설치 정보 확인
- repository owner/name/branch 설정
- full sync 실행
- 최근 ingestion run 목록
- publish된 notes 목록
- slug conflict, parse error, missing asset 목록
- generated URL 복사

MVP 인증:

- 사용자는 password session으로 로그인한다.
- 최초 사용자 bootstrap에는 `BOOTSTRAP_USER_EMAIL`과 `BOOTSTRAP_USER_PASSWORD_HASH`를 사용한다.
- `ALLOW_PUBLIC_SIGNUP=true`이면 공개 가입을 허용한다.
- session cookie는 `HttpOnly`, `Secure`, `SameSite=Lax`로 설정한다.
- public route와 dashboard route는 명확히 분리한다.
- 기존 `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`은 legacy fallback으로만 지원한다.

## GitHub 연동

### GitHub App

권장 권한:

- Repository metadata: read-only
- Repository contents: read-only
- Webhooks: optional for later managed mode

MVP에서는 GitHub webhook이나 repo-local 자동화 파일을 기본 경로로 사용하지 않는다. GitHub App은 파일 내용을 안전하게 읽기 위해 필요하고, 업데이트는 dashboard full sync job 또는 AI agent/API trigger로 시작한다.

저장해야 하는 값:

- `github_app_id`
- `github_installation_id`
- `owner`
- `repo`
- `branch`

private key는 DB에 저장하지 않고 Vercel secret/env로 둔다.

### Agent/API ingest trigger

vault repository에 별도 자동화 파일을 추가하지 않는다. 대신 AI agent나 외부 API client가 commit diff를 계산해 Lumenote API를 호출한다.

Trigger client의 역할:

1. `git diff --name-status {before} {after}` 실행
2. `*.md`와 supported asset만 필터링
3. rename을 `{ status: "renamed", path, previous_path }`로 정규화
4. repository owner, repo, branch, before SHA, after SHA를 payload에 포함
5. payload를 `POST /api/ingest/changed-paths`로 전송

공식 agent 경로는 `skills/lumenote-publisher` skill이다. 사용자가 웹에서 직접 갱신하려면 dashboard UI의 full sync job action을 사용한다.

## Ingestion API

### POST `/api/ingest/changed-paths`

AI agent 또는 외부 API client가 호출한다.

Headers:

```text
Authorization: Bearer {LUMENOTE_SITE_TOKEN}
Content-Type: application/json
```

Request:

```json
{
  "site_id": "site_123",
  "repository": {
    "owner": "simang",
    "repo": "my-vault",
    "branch": "main"
  },
  "before": "abc123",
  "after": "def456",
  "changes": [
    { "status": "modified", "path": "notes/example.md" },
    { "status": "deleted", "path": "notes/old.md" },
    {
      "status": "renamed",
      "previous_path": "notes/a.md",
      "path": "notes/b.md"
    }
  ]
}
```

Response:

```json
{
  "ingest_run_id": "run_123",
  "status": "accepted"
}
```

Validation:

- token은 site별 `LUMENOTE_SITE_TOKEN`과 매칭되어야 한다.
- site token이 없는 기존 site는 legacy `LUMENOTE_INGEST_TOKEN` fallback을 허용한다.
- `site_id`가 repository owner/repo/branch와 매칭되어야 한다.
- `after` commit이 configured branch에 포함되어야 한다.
- changes가 비어 있으면 no-op ingest run을 남긴다.

### POST `/api/ingest/full-sync`

Dashboard UI에서 호출한다. 이 endpoint는 sync를 직접 실행하지 않고 `ingest_jobs`에 full sync job을 queue한다.

Request:

```json
{
  "site_id": "site_123",
  "ref": "main"
}
```

동작:

1. Git Trees API recursive로 tree를 읽는다.
2. Markdown과 supported asset만 고른다.
3. DB에 저장된 `source_sha`와 비교한다.
4. 변경된 파일만 batch로 fetch한다.
5. 누락된 파일은 deleted 처리한다.

Full sync는 오래 걸릴 수 있으므로 dashboard request에서 직접 실행하지 않는다. MVP에서는 `ingest_jobs`에 queue한 뒤 worker endpoint가 한 번에 job 하나를 claim해서 실행한다.

### POST `/api/ingest/jobs/run`

Queued full sync job을 하나 claim해서 실행한다.

- Dashboard에서 로그인 세션으로 site별 queued job을 수동 실행할 수 있다.
- Worker/cron client는 `Authorization: Bearer {INGEST_WORKER_TOKEN}`을 사용한다.
- `INGEST_WORKER_TOKEN`이 없으면 legacy `LUMENOTE_INGEST_TOKEN`을 fallback으로 사용한다.
- 같은 site에 `queued` 또는 `running` full sync job이 있으면 추가 job은 만들지 않는다.

## Ingestion 알고리즘

### Changed paths sync

1. ingest run 생성
2. changed paths를 type별로 분류
3. deleted/renamed old path는 note와 asset을 unpublished/deleted 처리
4. modified/added/renamed new path는 GitHub에서 `after` ref 기준으로 content fetch
5. Markdown은 frontmatter parse
6. `lumenote.publish: true`가 아니면 public note store에서 제거
7. `lumenote.publish: true`면 Markdown AST 생성
8. wikilink, embed, heading, outgoing link 추출
9. slug 계산 및 충돌 검사
10. HTML 또는 renderable content 저장
11. link graph 갱신
12. asset은 필요한 경우 object storage에 upsert
13. ingest run 결과 저장

### Full sync

1. configured branch tree 조회
2. 모든 candidate file의 path, sha, size 저장
3. DB의 기존 source file index와 비교
4. changed/new/deleted 목록 생성
5. changed paths sync와 같은 처리 함수를 재사용

### Idempotency

같은 payload가 여러 번 들어와도 결과가 같아야 한다.

Idempotency key:

```text
site_id + after_commit_sha + normalized_changes_hash
```

이미 완료된 run이면 기존 결과를 반환한다.

## Markdown 처리

### Parser 후보

- `gray-matter`: frontmatter parse
- `unified`
- `remark-parse`
- `remark-gfm`
- `remark-frontmatter`
- custom wikilink plugin
- `rehype-stringify` 또는 React component renderer
- `rehype-sanitize`
- `shiki` 또는 `highlight.js` for code highlighting

### Normalized note

Markdown 파일은 ingestion 단계에서 다음 구조로 정규화한다.

```ts
type NormalizedNote = {
  siteId: string;
  path: string;
  sourceSha: string;
  title: string;
  slug: string;
  publish: boolean;
  visibility: "public" | "unlisted" | "private";
  frontmatter: Record<string, unknown>;
  lumenote: {
    publish: boolean;
    visibility: "public" | "unlisted" | "private";
    slug?: string;
    canonical?: string;
    theme: string;
    nav: boolean;
    backlinks: boolean;
    comments: boolean;
    access: {
      password: string | null;
      expires_at: string | null;
      allowlist: string[];
    };
  };
  body: string;
  html: string;
  outgoingLinks: NoteLink[];
  embeds: AssetRef[];
  headings: Heading[];
};
```

### Title resolution

우선순위:

1. frontmatter `title`
2. 첫 번째 Markdown H1
3. 파일명에서 확장자 제거

### Slug resolution

우선순위:

1. frontmatter `lumenote.slug`
2. Tolaria note id가 있으면 note id 기반 slug
3. vault 상대 path 기반 slug

중복 slug는 자동 suffix를 붙이지 않고 ingest error로 표시한다. 공개 URL이 조용히 바뀌면 안 되기 때문이다.

### Publish config resolution

Lumenote 전용 설정은 frontmatter의 `lumenote.*`만 canonical로 사용한다.

루트에서 읽는 일반 메타데이터:

- `title`
- `description`
- `tags`

Lumenote 전용 메타데이터:

- `lumenote.publish`
- `lumenote.visibility`
- `lumenote.slug`
- `lumenote.canonical`
- `lumenote.theme`
- `lumenote.nav`
- `lumenote.backlinks`
- `lumenote.comments`
- `lumenote.access`

MVP에서는 루트 `publish`, `visibility`, `slug` alias를 지원하지 않는다. 충돌과 의미 혼선을 줄이기 위해 처음부터 명시적인 namespace를 기준으로 삼는다.

### Wikilink resolution

지원 문법:

```text
[[Note]]
[[Note|Label]]
[[folder/Note]]
![[image.png]]
```

해석 순서:

1. 정확한 path match
2. title match
3. filename match
4. ambiguous이면 unresolved 처리

대상 note가 `lumenote.publish: true`가 아니면 public HTML에는 링크를 걸지 않는다. 단, 표시 텍스트는 유지한다.

### Backlinks

Backlink는 HTML에 고정으로 bake하지 않고 `note_links` 테이블에서 query해서 표시한다. 이렇게 하면 대상 note가 publish/unpublish될 때 모든 note HTML을 다시 렌더링하지 않아도 된다.

## Access model

### Public

- `/p/{site_slug}/{note_slug}`에서 접근 가능
- public navigation, sitemap, RSS에 포함 가능
- cache 가능

### Unlisted

- `/s/{share_token}`에서 접근 가능
- public navigation, sitemap, RSS에서 제외
- token은 DB에 hash로 저장
- share token은 충분히 긴 random value로 만든다.

### Private

- MVP에서는 public serving에서 제외한다.
- owner preview는 별도 route에서만 제공한다.

### Protected later

MVP 이후 추가 후보:

- password
- expires_at
- email allowlist
- domain allowlist

이 기능들은 static deployment보다 Lumenote-hosted serving에서 처리하는 것이 맞다.

## Data model

### `users`

| column | type | note |
|---|---|---|
| `id` | text pk | `user_` prefix |
| `email` | text unique | login email |
| `password_hash` | text | bcrypt hash |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

### `github_installations`

| column | type | note |
|---|---|---|
| `id` | text pk | `install_` prefix |
| `user_id` | text | owner user |
| `github_installation_id` | text unique | GitHub App installation |
| `account_login` | text null | GitHub account login |
| `account_type` | text null | future metadata |
| `repository_selection` | text null | future metadata |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

### `sites`

| column | type | note |
|---|---|---|
| `id` | text pk | `site_` prefix |
| `user_id` | text | owner user |
| `slug` | text unique | public URL segment |
| `name` | text | display name |
| `owner` | text | GitHub owner |
| `repo` | text | GitHub repo |
| `branch` | text | configured branch |
| `github_installation_id` | text | GitHub App installation |
| `ingest_token_hash` | text null | site-specific agent token hash |
| `ingest_token_ciphertext` | text null | encrypted token for dashboard copy |
| `ingest_token_last_four` | text null | display hint |
| `ingest_token_created_at` | timestamptz null | rotation timestamp |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

### `source_files`

| column | type | note |
|---|---|---|
| `site_id` | text |  |
| `path` | text | vault relative path |
| `source_sha` | text | Git blob sha |
| `kind` | text | `note`, `asset`, `other` |
| `size` | integer | bytes |
| `deleted_at` | timestamptz null |  |

Unique index:

```text
site_id, path
```

### `notes`

| column | type | note |
|---|---|---|
| `id` | text pk | `note_` prefix |
| `site_id` | text |  |
| `path` | text | vault relative path |
| `source_sha` | text | Git blob sha |
| `slug` | text | unique per site |
| `title` | text | resolved title |
| `description` | text null |  |
| `publish` | boolean | resolved from `lumenote.publish` |
| `visibility` | text | resolved from `lumenote.visibility` |
| `frontmatter` | jsonb | sanitized full metadata |
| `lumenote` | jsonb | normalized Lumenote config |
| `body_hash` | text | content hash |
| `html` | text | sanitized rendered HTML |
| `parse_error` | text null | last error |
| `published_at` | timestamptz null |  |
| `deleted_at` | timestamptz null |  |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

Unique indexes:

```text
site_id, path
site_id, slug where deleted_at is null
```

### `note_links`

| column | type | note |
|---|---|---|
| `site_id` | text |  |
| `source_note_id` | text |  |
| `target_path` | text null | resolved path |
| `target_note_id` | text null | resolved note |
| `label` | text | display label |
| `raw` | text | original wikilink |
| `status` | text | `resolved`, `unresolved`, `private`, `ambiguous` |

Index:

```text
site_id, target_note_id
```

### `assets`

| column | type | note |
|---|---|---|
| `id` | text pk | `asset_` prefix |
| `site_id` | text |  |
| `path` | text | vault relative path |
| `source_sha` | text | Git blob sha |
| `content_type` | text |  |
| `size` | integer | bytes |
| `storage_key` | text | object storage key |
| `public_url` | text null | if storage supports public URL |
| `deleted_at` | timestamptz null |  |

### `share_links`

| column | type | note |
|---|---|---|
| `id` | text pk | `share_` prefix |
| `site_id` | text |  |
| `note_id` | text |  |
| `token_hash` | text unique | never store raw token |
| `token_ciphertext` | text null | encrypted token for dashboard copy; old links may be null |
| `expires_at` | timestamptz null |  |
| `revoked_at` | timestamptz null |  |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

### `ingest_runs`

| column | type | note |
|---|---|---|
| `id` | text pk | `run_` prefix |
| `site_id` | text |  |
| `trigger` | text | `agent_api`, `dashboard_full_sync`, `manual`; `github_action` and `admin_full_sync` are legacy |
| `before_sha` | text null |  |
| `after_sha` | text |  |
| `status` | text | `accepted`, `running`, `completed`, `failed` |
| `summary` | jsonb | counts and errors |
| `started_at` | timestamptz |  |
| `finished_at` | timestamptz null |  |

### `ingest_jobs`

| column | type | note |
|---|---|---|
| `id` | text pk | `job_` prefix |
| `site_id` | text | owner site |
| `kind` | text | `full_sync` |
| `ref` | text null | branch/ref to sync |
| `trigger` | text | `dashboard_full_sync`, `manual` |
| `status` | text | `queued`, `running`, `completed`, `failed`, `cancelled` |
| `ingest_run_id` | text null | completed run log |
| `summary` | jsonb | result summary |
| `error` | text null | last error |
| `requested_by_user_id` | text null | dashboard user |
| `created_at` | timestamptz |  |
| `started_at` | timestamptz null |  |
| `finished_at` | timestamptz null |  |
| `updated_at` | timestamptz |  |

## Public rendering

### GET `/p/{site_slug}`

1. site 조회
2. public note 목록 조회
3. title/path 기준으로 정렬된 site home 반환
4. unlisted/private note는 제외

### GET `/p/{site_slug}/{note_slug}`

1. site 조회
2. note 조회
3. note가 없거나 public이 아니면 404
4. `visibility = public`인지 확인
5. HTML shell + sanitized content 반환
6. backlinks/outgoing links는 published note만 노출

### GET `/s/{share_token}`

1. token hash 계산
2. share link 조회
3. revoked/expired 확인
4. note 조회
5. note가 deleted/private이면 404
6. HTML shell + sanitized content 반환

MVP에서는 HTML을 DB에 저장하고 route에서 shell에 삽입한다. 이후 React Server Components 또는 MDX-like component rendering으로 바꿀 수 있다.

## Cache strategy

### Public page

- note updated_at/source_sha를 ETag로 사용한다.
- public page는 CDN cache 가능하다.
- unlisted page는 token route이므로 conservative cache를 적용한다.

### Assets

- asset URL에 `source_sha`를 포함한다.
- 긴 cache TTL을 사용할 수 있다.

Example:

```text
/assets/{site_id}/{source_sha}/{filename}
```

## Error handling

Ingestion error는 가능한 한 site 전체 publish를 막지 않는다.

- 한 note parse 실패: 해당 note만 `parse_error` 기록
- slug conflict: 충돌 note들을 unpublished 상태로 두고 dashboard에 표시
- missing asset: note는 publish하되 missing asset placeholder 표시
- GitHub fetch 실패: ingest run failed, 기존 published content 유지
- DB write 실패: ingest run failed, partial write는 transaction으로 rollback

## Security

- Lumenote API는 file content를 ingest payload에서 받지 않는다.
- GitHub file content는 GitHub App installation token으로만 읽는다.
- site별 ingest token은 hash와 encrypted ciphertext로 저장한다.
- legacy global ingest token은 site token 미발급 site에 대한 fallback으로만 허용한다.
- ingest payload의 `site_id`, repository, branch를 DB 설정과 비교한다.
- Markdown HTML은 sanitize한다.
- raw HTML 허용 여부는 기본 false로 둔다.
- private/unpublished note의 title/path/frontmatter가 public output에 새지 않게 한다.
- share token은 조회 검증용 hash를 저장하고, dashboard 재복사를 위해 별도 ciphertext로 암호화 저장한다.
- 기존 hash-only link는 URL 복구가 불가능하므로 새 link를 생성해야 한다.

## 배포 설정

Vercel env:

```text
DATABASE_URL=
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_WEBHOOK_SECRET=
LUMENOTE_INGEST_TOKEN=
INGEST_WORKER_TOKEN=
BOOTSTRAP_USER_EMAIL=
BOOTSTRAP_USER_PASSWORD_HASH=
AUTH_SESSION_SECRET=
SHARE_TOKEN_ENCRYPTION_SECRET=
INGEST_TOKEN_ENCRYPTION_SECRET=
OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=
OBJECT_STORAGE_BUCKET=
```

`GITHUB_APP_WEBHOOK_SECRET`은 MVP에서 GitHub webhook을 쓰지 않더라도 나중에 managed mode를 위해 예약한다.

## 로컬 개발

필요 명령은 구현 후 확정한다. 목표는 다음 구조다.

```text
npm run dev
npm run db:migrate
npm run ingest:full -- --site site_123
npm run test
```

로컬 fixture vault를 두고 parser와 renderer를 먼저 검증한다.

```text
fixtures/vault/basic
fixtures/vault/wikilinks
fixtures/vault/assets
fixtures/vault/frontmatter
```

## 구현 순서

1. Next.js 앱 scaffold
2. DB schema와 migration setup
3. local fixture 기반 Markdown parser
4. frontmatter publish filter
5. wikilink resolver와 link graph
6. public note renderer
7. GitHub App installation token client
8. changed-path ingestion API
9. Lumenote publisher agent skill
10. dashboard full sync job action
11. asset storage/proxy
12. dashboard UI
13. share link

## 남은 결정

- Tolaria note type/resource/project schema를 public page template에 반영할지
- changed-path trigger token을 site별로 발급/회전할지

## 참고 문서

- GitHub REST API rate limits: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- GitHub Git Trees API: https://docs.github.com/en/rest/git/trees
- GitHub repository contents API: https://docs.github.com/en/rest/repos/contents
