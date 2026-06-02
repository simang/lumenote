# Lumenote Spec

## 개요

Lumenote는 Tolaria로 작성된 Markdown vault를 웹 페이지로 공개할 수 있게 해주는 publishing 서비스다. 사용자는 GitHub에 저장한 vault를 연결하고, Lumenote는 노트의 frontmatter와 링크 구조를 읽어 공개 가능한 페이지로 렌더링한다.

핵심 방향은 "private vault에서 선택된 노트만 web page로 publish"하는 것이다. Notion의 public page처럼 공개 URL을 만들 수 있고, 필요하면 링크를 받은 사람만 접근 가능한 unlisted page도 생성할 수 있다.

## 목표

- Tolaria vault를 GitHub repository에서 read-only로 가져온다.
- Markdown, frontmatter, wikilink, backlink, embed를 웹에서 읽기 좋은 문서로 렌더링한다.
- frontmatter 기반으로 노트별 공개 여부, URL slug, 접근 정책, SEO 설정을 제어한다.
- public page와 unlisted share link를 모두 지원한다.
- Vercel을 기본 serving/deployment 플랫폼 후보로 사용한다.
- 사용자가 별도 빌드 파이프라인을 직접 관리하지 않아도 publish할 수 있게 한다.

## 비목표

- Lumenote에서 vault 내용을 직접 편집하지 않는다.
- GitHub repository에 write 권한을 요구하지 않는다.
- 초기 버전에서 Notion 수준의 블록 편집 경험을 제공하지 않는다.
- 초기 버전에서 완전한 private team workspace 기능을 제공하지 않는다.
- 링크만 가진 접근은 보안상 "unlisted"로 취급한다. 강한 보호가 필요한 경우 별도 인증 정책이 필요하다.

## 대상 사용자

- Tolaria를 개인 지식관리 도구로 쓰고 일부 노트를 공개하고 싶은 사용자
- Markdown 기반 docs, digital garden, portfolio, project log를 운영하고 싶은 사용자
- GitHub에 vault를 백업하고 있고 별도 static site generator 설정을 줄이고 싶은 사용자

## 유사 서비스 참고

- Obsidian Publish: 공식 publish 서비스. GitHub/Vercel 기반은 아니다.
- Obsidian Digital Garden: frontmatter 기반 publish와 Vercel 배포 흐름이 유사하다.
- Quartz: Markdown/Obsidian vault를 static site로 변환하는 강력한 SSG다.
- Flowershow: Markdown repository를 hosted website로 publish하는 서비스다.
- JotBird: Obsidian 단일 노트 공유 링크에 가까운 서비스다.

Lumenote의 차별점은 Tolaria-first 데이터 모델, GitHub read-only vault ingestion, frontmatter 기반 접근 정책, managed web serving을 하나의 제품 흐름으로 제공하는 것이다.

## 핵심 사용자 흐름

### 1. GitHub vault 연결

1. 사용자가 Lumenote에 로그인한다.
2. GitHub OAuth 또는 GitHub App 설치를 통해 vault repository read 권한을 제공한다.
3. Lumenote가 repository 목록에서 vault 후보를 보여준다.
4. 사용자가 vault repository와 branch를 선택한다.
5. Lumenote가 repository를 clone/fetch하고 Markdown 파일을 인덱싱한다.

### 2. 공개 노트 publish

1. 사용자가 Tolaria 노트 frontmatter에 publish 설정을 추가한다.
2. GitHub에 commit/push한다.
3. Lumenote가 webhook 또는 polling으로 변경을 감지한다.
4. 변경된 vault를 다시 인덱싱한다.
5. publish 대상 노트를 웹 페이지로 렌더링한다.
6. public URL 또는 unlisted URL을 생성한다.

### 3. 공유 링크 생성

1. 노트 frontmatter에 `visibility: unlisted`를 설정한다.
2. Lumenote가 예측 불가능한 share token을 포함한 URL을 생성한다.
3. 링크를 받은 사람은 로그인 없이 페이지를 볼 수 있다.
4. 만료일, password, allowlist가 설정된 경우 Lumenote 서버가 접근을 검사한다.

## Frontmatter 스키마

초기 제안 스키마:

```yaml
publish: true
visibility: public
slug: my-note
title: My Note
description: Short page description
canonical: https://example.com/my-note
tags:
  - product
  - note
lumenote:
  theme: default
  nav: true
  backlinks: true
  comments: false
  access:
    password: null
    expires_at: null
    allowlist: []
```

### 필드 정의

| 필드 | 타입 | 기본값 | 설명 |
|---|---:|---:|---|
| `publish` | boolean | `false` | 노트 publish 여부 |
| `visibility` | string | `public` | `public`, `unlisted`, `private` |
| `slug` | string | 파일 경로 기반 | 웹 URL 경로 |
| `title` | string | 파일명 또는 Markdown H1 | 페이지 제목 |
| `description` | string | 없음 | SEO/미리보기 설명 |
| `canonical` | string | 없음 | canonical URL |
| `tags` | string[] | `[]` | 태그 및 탐색용 메타데이터 |
| `lumenote.theme` | string | `default` | 페이지 테마 |
| `lumenote.nav` | boolean | `true` | 사이트 내 탐색 노출 여부 |
| `lumenote.backlinks` | boolean | `true` | backlink 영역 노출 여부 |
| `lumenote.comments` | boolean | `false` | 댓글 기능 노출 여부 |
| `lumenote.access.password` | string/null | `null` | password 보호 |
| `lumenote.access.expires_at` | datetime/null | `null` | share link 만료 |
| `lumenote.access.allowlist` | string[] | `[]` | 이메일/domain allowlist |

## 공개 정책

### Public

- 검색 엔진 인덱싱 가능
- 사이트 목록, sitemap, RSS에 포함 가능
- 예시 URL: `https://user.lumenote.dev/my-note`

### Unlisted

- sitemap, RSS, public navigation에서 제외
- 예측 불가능한 token 기반 URL 사용
- 예시 URL: `https://user.lumenote.dev/share/n_7f3k...`
- 링크를 가진 사람은 접근 가능하므로 민감 정보 보호 용도로는 충분하지 않다.

### Private

- publish 대상에서 제외하거나 인증된 소유자만 접근 가능
- MVP에서는 `publish: false`와 동일하게 처리할 수 있다.

## URL 설계

사용자별 subdomain:

```text
https://{site}.lumenote.dev/{slug}
https://{site}.lumenote.dev/share/{token}
```

커스텀 도메인:

```text
https://notes.example.com/{slug}
https://notes.example.com/share/{token}
```

slug 충돌 처리:

1. 명시적 `slug`가 있으면 우선 사용한다.
2. 중복 slug는 빌드 오류로 표시한다.
3. `slug`가 없으면 vault 상대 경로를 URL-safe path로 변환한다.

## 렌더링 요구사항

- CommonMark/GFM Markdown 지원
- Tolaria/Obsidian 스타일 wikilink 지원
  - `[[Note]]`
  - `[[Note|Label]]`
  - `![[Attachment.png]]`
- 상대 링크와 vault 내부 링크 해석
- frontmatter 제거 후 본문 렌더링
- code block syntax highlighting
- heading anchor 생성
- table, task list, footnote 지원
- backlink, outgoing link 표시
- 이미지/첨부파일 serving
- publish되지 않은 내부 링크는 비활성 링크 또는 404-safe placeholder로 처리

## 시스템 아키텍처

초기 권장 구조:

```text
GitHub Repository
  -> GitHub App / OAuth
  -> Lumenote API Server
  -> Vault Ingestion Worker
  -> Markdown Parser / Indexer
  -> Rendered Page Store
  -> Web Renderer
  -> Vercel Deployment or Edge Serving
```

### 주요 컴포넌트

| 컴포넌트 | 역할 |
|---|---|
| API Server | 사용자, repository 연결, site 설정, publish 상태 관리 |
| GitHub Integration | GitHub App 설치, repo read, webhook 수신 |
| Ingestion Worker | vault clone/fetch, 변경 파일 감지, 인덱싱 |
| Markdown Parser | frontmatter, Markdown AST, wikilink, asset 분석 |
| Access Controller | public/unlisted/private/password/allowlist 검사 |
| Renderer | HTML/React page 렌더링 |
| Deployment Adapter | Vercel 배포 또는 자체 serving 연결 |

## 데이터 모델 초안

### User

- `id`
- `email`
- `name`
- `github_account_id`
- `created_at`

### Site

- `id`
- `user_id`
- `name`
- `subdomain`
- `custom_domain`
- `repo_id`
- `branch`
- `status`
- `created_at`
- `updated_at`

### Note

- `id`
- `site_id`
- `path`
- `slug`
- `title`
- `description`
- `visibility`
- `publish`
- `content_hash`
- `frontmatter`
- `html`
- `created_at`
- `updated_at`

### ShareLink

- `id`
- `note_id`
- `token_hash`
- `expires_at`
- `password_hash`
- `created_at`
- `revoked_at`

### Asset

- `id`
- `site_id`
- `path`
- `content_type`
- `content_hash`
- `storage_url`

## GitHub 권한

권장 방식은 GitHub App이다.

필요 권한:

- Repository contents: read-only
- Metadata: read-only
- Webhooks: push event

OAuth token보다 GitHub App이 repository 단위 설치와 권한 제한에 유리하다. Vercel 연동이 필요한 경우에는 사용자의 Vercel account/team 권한을 별도로 받는다.

## Vercel 연동 옵션

### 옵션 A: Lumenote가 직접 serving

- Lumenote 서버 또는 edge runtime에서 렌더링된 페이지를 제공한다.
- 접근 제어 구현이 쉽다.
- Vercel 권한 위임이 필수가 아니다.
- 운영 비용과 트래픽 처리를 Lumenote가 부담한다.

### 옵션 B: 사용자 Vercel에 배포

- 사용자가 Vercel 권한을 제공한다.
- Lumenote가 site artifact를 만들어 Vercel에 배포한다.
- static page serving 비용을 줄일 수 있다.
- unlisted/password/allowlist 같은 서버 측 접근 제어가 복잡해진다.

### 옵션 C: 하이브리드

- public page는 static deployment로 제공한다.
- unlisted/private/protected page는 Lumenote edge/API에서 제공한다.
- MVP 이후 확장 방향으로 적합하다.

MVP는 옵션 A가 가장 단순하다. Vercel은 추후 custom deployment adapter로 붙이는 것이 구현 리스크가 낮다.

## 보안 고려사항

- GitHub 권한은 read-only로 제한한다.
- clone된 vault는 site별 격리된 storage에 저장한다.
- unlisted token은 원문 저장하지 않고 hash로 저장한다.
- password는 bcrypt/argon2로 hash한다.
- publish되지 않은 노트의 제목, 경로, 링크 정보가 public page에 새지 않도록 필터링한다.
- asset도 노트와 동일한 visibility 정책을 따른다.
- webhook payload 검증을 필수로 한다.
- Markdown HTML injection을 방지하기 위해 sanitizer를 적용한다.

## MVP 범위

1. GitHub App 기반 repository 연결
2. Markdown vault clone/fetch
3. frontmatter `publish: true` 노트만 인덱싱
4. `public` visibility 페이지 렌더링
5. `unlisted` share link 생성
6. wikilink 기본 변환
7. 이미지 asset serving
8. site별 subdomain 또는 path-based URL
9. webhook 기반 rebuild
10. 기본 대시보드

## MVP 이후

- 커스텀 도메인
- password protected page
- email/domain allowlist
- RSS, sitemap
- full-text search
- graph view
- theme customization
- analytics
- comment integration
- Vercel deployment adapter
- Obsidian/plain Markdown compatibility

## 오픈 질문

- Tolaria vault의 canonical schema와 note type을 얼마나 강하게 웹에 반영할 것인가?
- publish된 노트만 별도 materialized store에 저장할 것인가, 매 요청마다 렌더링할 것인가?
- unlisted link를 frontmatter에서 직접 생성/관리하게 할 것인가, Lumenote dashboard에서 생성하게 할 것인가?
- Vercel 권한 위임을 MVP에 포함할 것인가?
- 공개 사이트의 기본 URL은 subdomain 방식으로 갈 것인가, `lumenote.dev/{site}` 방식으로 갈 것인가?
- Tolaria 앱 내부에서 Lumenote publish 상태를 보여주는 integration을 만들 것인가?

## 권장 첫 구현 순서

1. Tolaria vault parser prototype
2. frontmatter publish filter
3. wikilink resolver
4. static renderer prototype
5. GitHub App integration
6. ingestion worker
7. public/unlisted route serving
8. small dashboard

