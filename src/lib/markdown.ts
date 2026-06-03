import matter from "gray-matter";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { sha256 } from "./crypto";
import type {
  AssetRef,
  Heading,
  NormalizedLumenoteConfig,
  NoteLink,
  RenderedNote,
  ResolverNote,
  Visibility,
} from "./types";

export type ParsedNoteDraft = {
  siteId: string;
  path: string;
  sourceSha: string;
  title: string;
  description: string | null;
  tags: string[];
  slug: string;
  publish: boolean;
  visibility: Visibility;
  frontmatter: Record<string, unknown>;
  lumenote: NormalizedLumenoteConfig;
  body: string;
  bodyHash: string;
  headings: Heading[];
};

export type NoteTargetResolution =
  | {
      status: "resolved";
      note: ResolverNote;
      href: string | null;
    }
  | {
      status: "private";
      note: ResolverNote;
    }
  | {
      status: "ambiguous";
      candidates: ResolverNote[];
    }
  | {
      status: "unresolved";
    };

export type AssetResolution = {
  path: string;
  href: string;
} | null;

type RenderContext = {
  notePath: string;
  resolveNote: (target: string) => NoteTargetResolution;
  resolveAsset: (target: string, notePath: string) => AssetResolution;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function asVisibility(value: unknown): Visibility {
  return value === "unlisted" || value === "private" || value === "public" ? value : "public";
}

export function slugifySegment(value: string) {
  const slug = value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}._~-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return slug || "note";
}

export function slugFromPath(path: string) {
  return path
    .replace(/\.md$/i, "")
    .split("/")
    .filter(Boolean)
    .map(slugifySegment)
    .join("/");
}

function normalizeSlug(value: string) {
  return value
    .split("/")
    .filter(Boolean)
    .map(slugifySegment)
    .join("/");
}

function basenameWithoutExtension(path: string) {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.[^.]+$/, "");
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[`*_~>#-]/g, "")
    .trim();
}

function firstH1(body: string) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? stripInlineMarkdown(match[1]) : undefined;
}

export function headingId(text: string) {
  return slugifySegment(stripInlineMarkdown(text));
}

export function extractHeadings(body: string): Heading[] {
  const headings: Heading[] = [];

  for (const match of body.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
    const text = stripInlineMarkdown(match[2]);
    if (!text) {
      continue;
    }

    headings.push({
      depth: match[1].length,
      text,
      id: headingId(text),
    });
  }

  return headings;
}

function normalizeLumenoteConfig(frontmatter: Record<string, unknown>): NormalizedLumenoteConfig {
  const raw = isRecord(frontmatter.lumenote) ? frontmatter.lumenote : {};
  const access = isRecord(raw.access) ? raw.access : {};
  const slug = asString(raw.slug);
  const canonical = asString(raw.canonical);

  return {
    publish: raw.publish === true,
    visibility: asVisibility(raw.visibility),
    slug: slug ? normalizeSlug(slug) : undefined,
    canonical,
    theme: asString(raw.theme) ?? "default",
    nav: asBoolean(raw.nav, true),
    backlinks: asBoolean(raw.backlinks, true),
    comments: asBoolean(raw.comments, false),
    access: {
      password: asString(access.password) ?? null,
      expires_at: asString(access.expires_at) ?? null,
      allowlist: asStringArray(access.allowlist),
    },
  };
}

export function parseNoteDraft(input: {
  siteId: string;
  path: string;
  sourceSha: string;
  markdown: string;
}): ParsedNoteDraft {
  const parsed = matter(input.markdown);
  const frontmatter = isRecord(parsed.data) ? parsed.data : {};
  const lumenote = normalizeLumenoteConfig(frontmatter);
  const body = parsed.content.trimStart();
  const title = asString(frontmatter.title) ?? firstH1(body) ?? basenameWithoutExtension(input.path);
  const description = asString(frontmatter.description) ?? null;
  const tags = asStringArray(frontmatter.tags);
  const slug = lumenote.slug ?? slugFromPath(input.path);

  return {
    siteId: input.siteId,
    path: input.path,
    sourceSha: input.sourceSha,
    title,
    description,
    tags,
    slug,
    publish: lumenote.publish,
    visibility: lumenote.visibility,
    frontmatter,
    lumenote,
    body,
    bodyHash: sha256(body),
    headings: extractHeadings(body),
  };
}

function markdownSanitizeSchema() {
  const schema = structuredClone(defaultSchema) as any;

  schema.attributes = {
    ...(schema.attributes ?? {}),
    "*": [...((schema.attributes?.["*"] as unknown[]) ?? []), ["className"]],
    a: [
      ...((schema.attributes?.a as unknown[]) ?? []),
      ["target"],
      ["rel"],
      ["ariaLabel"],
    ],
    img: [
      ...((schema.attributes?.img as unknown[]) ?? []),
      ["loading"],
      ["decoding"],
      ["className"],
    ],
    input: [
      ...((schema.attributes?.input as unknown[]) ?? []),
      ["type"],
      ["checked"],
      ["disabled"],
      ["className"],
    ],
    code: [...((schema.attributes?.code as unknown[]) ?? []), ["className"]],
    pre: [...((schema.attributes?.pre as unknown[]) ?? []), ["className"]],
    span: [...((schema.attributes?.span as unknown[]) ?? []), ["className"]],
  };
  schema.tagNames = [...new Set([...(schema.tagNames ?? []), "input"])];

  return schema;
}

function stripLeadingTitleH1(body: string, title: string) {
  const lines = body.split("\n");
  const firstLine = lines[0] ?? "";
  const match = firstLine.match(/^#\s+(.+)$/);

  if (!match || stripInlineMarkdown(match[1]) !== title.trim()) {
    return body;
  }

  const remaining = lines.slice(1);
  if (remaining[0] === "") {
    remaining.shift();
  }

  return remaining.join("\n").trimStart();
}

function isFenceLine(line: string) {
  return /^\s*(```+|~~~+)/.test(line);
}

function replaceOutsideFences(body: string, replacer: (line: string) => string) {
  const lines = body.split("\n");
  let inFence = false;

  return lines
    .map((line) => {
      if (isFenceLine(line)) {
        inFence = !inFence;
        return line;
      }

      return inFence ? line : replacer(line);
    })
    .join("\n");
}

function escapeMarkdownText(value: string) {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function escapeMarkdownUrl(value: string) {
  return value.replace(/\)/g, "%29").replace(/\s/g, "%20");
}

function defaultWikilinkLabel(target: string) {
  const withoutHeading = target.split("#")[0];
  return basenameWithoutExtension(withoutHeading.split("/").pop() ?? withoutHeading);
}

function parseWikilinkTarget(target: string) {
  return target.split("#")[0].trim();
}

function rewriteWikilinks(body: string, context: RenderContext) {
  const links: NoteLink[] = [];
  const embeds: AssetRef[] = [];
  const wikilinkPattern = /(!?)\[\[([^\]|]+?)(?:\|([^\]]+))?]]/g;

  const markdown = replaceOutsideFences(body, (line) =>
    line.replace(wikilinkPattern, (raw: string, embedMarker: string, rawTarget: string, rawLabel?: string) => {
      const target = parseWikilinkTarget(rawTarget);
      const label = (rawLabel?.trim() || defaultWikilinkLabel(rawTarget)).trim();

      if (embedMarker === "!") {
        const asset = context.resolveAsset(target, context.notePath);
        embeds.push({
          raw,
          path: asset?.path ?? null,
          status: asset ? "resolved" : "missing",
        });

        if (!asset) {
          return escapeMarkdownText(`[missing asset: ${label}]`);
        }

        return `![${escapeMarkdownText(label)}](${escapeMarkdownUrl(asset.href)})`;
      }

      const resolution = context.resolveNote(target);

      if (resolution.status === "resolved") {
        links.push({
          raw,
          label,
          targetPath: resolution.note.path,
          targetNoteId: resolution.note.id,
          status: "resolved",
        });

        if (resolution.href) {
          return `[${escapeMarkdownText(label)}](${escapeMarkdownUrl(resolution.href)})`;
        }

        return escapeMarkdownText(label);
      }

      if (resolution.status === "private") {
        links.push({
          raw,
          label,
          targetPath: resolution.note.path,
          targetNoteId: resolution.note.id,
          status: "private",
        });
        return escapeMarkdownText(label);
      }

      links.push({
        raw,
        label,
        targetPath: null,
        targetNoteId: null,
        status: resolution.status,
      });
      return escapeMarkdownText(label);
    }),
  );

  return { markdown, links, embeds };
}

function isExternalOrRootUrl(url: string) {
  return /^(https?:|mailto:|tel:|data:|#|\/)/i.test(url);
}

function rewriteMarkdownImages(body: string, context: RenderContext) {
  const imagePattern = /!\[([^\]]*)]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

  return replaceOutsideFences(body, (line) =>
    line.replace(imagePattern, (raw: string, alt: string, url: string) => {
      if (isExternalOrRootUrl(url)) {
        return raw;
      }

      const asset = context.resolveAsset(decodeURIComponent(url), context.notePath);
      if (!asset) {
        return escapeMarkdownText(`[missing asset: ${url}]`);
      }

      return `![${escapeMarkdownText(alt)}](${escapeMarkdownUrl(asset.href)})`;
    }),
  );
}

async function renderMarkdownToHtml(markdown: string) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeSanitize, markdownSanitizeSchema())
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}

export async function renderNoteDraft(
  draft: ParsedNoteDraft,
  context: Omit<RenderContext, "notePath">,
): Promise<RenderedNote> {
  const fullContext = {
    ...context,
    notePath: draft.path,
  };
  const body = stripLeadingTitleH1(draft.body, draft.title);
  const imageRewritten = rewriteMarkdownImages(body, fullContext);
  const wikilinkRewritten = rewriteWikilinks(imageRewritten, fullContext);
  const html = await renderMarkdownToHtml(wikilinkRewritten.markdown);

  return {
    html,
    outgoingLinks: wikilinkRewritten.links,
    embeds: wikilinkRewritten.embeds,
  };
}

export function encodeVaultPathForUrl(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function resolveVaultPath(currentNotePath: string, target: string) {
  const normalizedTarget = target.replace(/^\/+/, "");
  if (!normalizedTarget) {
    return normalizedTarget;
  }

  if (!target.startsWith(".") && !target.startsWith("../")) {
    return normalizedTarget;
  }

  const currentDir = currentNotePath.split("/").slice(0, -1);
  const parts = [...currentDir, ...target.split("/")];
  const resolved: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }

  return resolved.join("/");
}

export function notePathCandidates(currentNotePath: string, target: string) {
  const base = resolveVaultPath(currentNotePath, parseWikilinkTarget(target));
  const candidates = [base];
  if (!base.toLowerCase().endsWith(".md")) {
    candidates.push(`${base}.md`);
  }
  return candidates;
}
