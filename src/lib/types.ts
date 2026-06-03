export type Visibility = "public" | "unlisted" | "private";

export type User = {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
};

export type GitHubInstallation = {
  id: string;
  user_id: string;
  github_installation_id: string;
  account_login: string | null;
  account_type: string | null;
  repository_selection: string | null;
  created_at: Date;
  updated_at: Date;
};

export type Site = {
  id: string;
  user_id: string | null;
  slug: string;
  name: string;
  owner: string;
  repo: string;
  branch: string;
  github_installation_id: string;
  ingest_token_hash: string | null;
  ingest_token_ciphertext: string | null;
  ingest_token_last_four: string | null;
  ingest_token_created_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type SourceFile = {
  site_id: string;
  path: string;
  source_sha: string;
  kind: "note" | "asset" | "other";
  size: number;
  deleted_at: Date | null;
};

export type Note = {
  id: string;
  site_id: string;
  path: string;
  source_sha: string;
  slug: string;
  title: string;
  description: string | null;
  publish: boolean;
  visibility: Visibility;
  frontmatter: Record<string, unknown>;
  lumenote: NormalizedLumenoteConfig;
  body_hash: string;
  html: string;
  parse_error: string | null;
  published_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type NormalizedLumenoteConfig = {
  publish: boolean;
  visibility: Visibility;
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

export type Heading = {
  depth: number;
  text: string;
  id: string;
};

export type NoteLink = {
  targetPath: string | null;
  targetNoteId: string | null;
  label: string;
  raw: string;
  status: "resolved" | "unresolved" | "private" | "ambiguous";
};

export type AssetRef = {
  path: string | null;
  raw: string;
  status: "resolved" | "missing";
};

export type ResolverNote = Pick<
  Note,
  "id" | "path" | "title" | "slug" | "publish" | "visibility" | "deleted_at" | "parse_error"
>;

export type RenderedNote = {
  html: string;
  outgoingLinks: NoteLink[];
  embeds: AssetRef[];
};
