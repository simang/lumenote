import { load } from "js-yaml";
import { fetchRepositoryFile, fetchRepositoryTree } from "./github";
import type { OwnerNoteSummary } from "./repositories";
import type { Site } from "./types";

export type VaultPropertyValue = string | number | boolean | null | Array<string | number | boolean>;

export type OwnerVaultEntry = {
  id: string;
  path: string;
  slug: string;
  title: string;
  description: string | null;
  noteType: string;
  status: string | null;
  publish: boolean;
  visibility: string;
  parseError: string | null;
  archived: boolean;
  organized: boolean;
  favorite: boolean;
  favoriteIndex: number | null;
  icon: string | null;
  color: string | null;
  order: number | null;
  sort: string | null;
  view: string | null;
  listPropertiesDisplay: string[];
  relationships: Record<string, string[]>;
  properties: Record<string, VaultPropertyValue>;
  snippet: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type VaultFilter = "all" | "inbox" | "favorites" | "archived";

export type VaultSelection =
  | { kind: "filter"; filter: VaultFilter }
  | { kind: "type"; type: string }
  | { kind: "view"; filename: string };

export type FilterOp =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "any_of"
  | "none_of"
  | "is_empty"
  | "is_not_empty"
  | "before"
  | "after";

export type FilterCondition = {
  field: string;
  op: FilterOp;
  value?: unknown;
  regex?: boolean;
};

export type FilterGroup = { all: FilterNode[] } | { any: FilterNode[] };
export type FilterNode = FilterCondition | FilterGroup;

export type ViewDefinition = {
  name: string;
  icon: string | null;
  color: string | null;
  order: number | null;
  sort: string | null;
  filters: FilterGroup;
  listPropertiesDisplay: string[];
};

export type ViewFile = {
  filename: string;
  path: string;
  definition: ViewDefinition;
};

export type LoadedViews = {
  views: ViewFile[];
  error: string | null;
};

type ResolvedField =
  | { kind: "scalar"; value: string | number | boolean | null }
  | { kind: "array"; values: string[] };

type SortDirection = "asc" | "desc";

type SortConfig = {
  option: string;
  direction: SortDirection;
};

const FILTER_OPS = new Set<FilterOp>([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "any_of",
  "none_of",
  "is_empty",
  "is_not_empty",
  "before",
  "after",
]);

const STRUCTURAL_KEYS = new Set([
  "aliases",
  "description",
  "favorite",
  "favorite_index",
  "lumenote",
  "organized",
  "status",
  "title",
  "type",
  "_favorite",
  "_favorite_index",
  "_icon",
  "_list_properties_display",
  "_order",
  "_organized",
  "_sort",
  "_view",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function scalarPropertyValue(value: unknown): VaultPropertyValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string | number | boolean =>
        typeof item === "string" || typeof item === "number" || typeof item === "boolean",
    );
    return items.length > 0 ? items : undefined;
  }

  return undefined;
}

function valuesFromUnknown(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap(valuesFromUnknown);
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap(valuesFromUnknown);
  }

  return [value];
}

function extractWikilinks(value: unknown) {
  const targets: string[] = [];
  const pattern = /\[\[([^\]|]+?)(?:\|[^\]]+)?]]/g;

  for (const item of valuesFromUnknown(value)) {
    if (typeof item !== "string") {
      continue;
    }

    for (const match of item.matchAll(pattern)) {
      const target = match[1].trim();
      if (target) {
        targets.push(target);
      }
    }
  }

  return [...new Set(targets)];
}

function splitFrontmatter(frontmatter: Record<string, unknown>) {
  const relationships: Record<string, string[]> = {};
  const properties: Record<string, VaultPropertyValue> = {};

  for (const [key, value] of Object.entries(frontmatter)) {
    const links = extractWikilinks(value);
    if (links.length > 0) {
      relationships[key] = links;
      continue;
    }

    const property = scalarPropertyValue(value);
    if (property !== undefined && !STRUCTURAL_KEYS.has(key.toLowerCase())) {
      properties[key] = property;
    }
  }

  return { relationships, properties };
}

function booleanFrontmatter(frontmatter: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asBoolean(frontmatter[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function numberFrontmatter(frontmatter: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asNumber(frontmatter[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function stringFrontmatter(frontmatter: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asString(frontmatter[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function normalizedSnippet(snippet: string | null) {
  if (!snippet) {
    return null;
  }

  const text = snippet.replace(/\s+/g, " ").trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export function toOwnerVaultEntries(notes: OwnerNoteSummary[]) {
  return notes.map((note) => {
    const frontmatter = isRecord(note.frontmatter) ? note.frontmatter : {};
    const noteType = stringFrontmatter(frontmatter, ["type", "isA"]) ?? "Note";
    const status = stringFrontmatter(frontmatter, ["status"]);
    const favorite = booleanFrontmatter(frontmatter, ["_favorite", "favorite"]) ?? false;
    const explicitOrganized = booleanFrontmatter(frontmatter, ["_organized", "organized"]);
    const archived = status?.toLowerCase() === "archived" || booleanFrontmatter(frontmatter, ["_archived", "archived"]) === true;
    const organized = explicitOrganized ?? noteType === "Type";
    const { relationships, properties } = splitFrontmatter(frontmatter);

    return {
      id: note.id,
      path: note.path,
      slug: note.slug,
      title: note.title,
      description: note.description,
      noteType,
      status,
      publish: note.publish,
      visibility: note.visibility,
      parseError: note.parse_error,
      archived,
      organized,
      favorite,
      favoriteIndex: numberFrontmatter(frontmatter, ["_favorite_index", "favorite_index"]),
      icon: stringFrontmatter(frontmatter, ["_icon", "icon"]),
      color: stringFrontmatter(frontmatter, ["_color", "color"]),
      order: numberFrontmatter(frontmatter, ["_order", "order"]),
      sort: stringFrontmatter(frontmatter, ["_sort", "sort"]),
      view: stringFrontmatter(frontmatter, ["_view", "view"]),
      listPropertiesDisplay: asStringArray(frontmatter._list_properties_display ?? frontmatter.list_properties_display),
      relationships,
      properties,
      snippet: normalizedSnippet(note.snippet),
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    } satisfies OwnerVaultEntry;
  });
}

export function typeDefinitions(entries: OwnerVaultEntry[]) {
  return new Map(
    entries
      .filter((entry) => entry.noteType === "Type")
      .map((entry) => [entry.title, entry]),
  );
}

export function visibleTypes(entries: OwnerVaultEntry[]) {
  const definitions = typeDefinitions(entries);
  const counts = new Map<string, number>();

  for (const entry of entries) {
    if (entry.archived || entry.noteType === "Type") {
      continue;
    }

    counts.set(entry.noteType, (counts.get(entry.noteType) ?? 0) + 1);
  }

  return [...counts.keys()]
    .sort((left, right) => {
      const leftOrder = definitions.get(left)?.order ?? Number.POSITIVE_INFINITY;
      const rightOrder = definitions.get(right)?.order ?? Number.POSITIVE_INFINITY;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.localeCompare(right);
    })
    .map((type) => ({
      type,
      count: counts.get(type) ?? 0,
      definition: definitions.get(type) ?? null,
    }));
}

function normalizeFilterNode(value: unknown): FilterNode | null {
  if (!isRecord(value)) {
    return null;
  }

  if (Array.isArray(value.all)) {
    return { all: value.all.map(normalizeFilterNode).filter((node): node is FilterNode => Boolean(node)) };
  }

  if (Array.isArray(value.any)) {
    return { any: value.any.map(normalizeFilterNode).filter((node): node is FilterNode => Boolean(node)) };
  }

  const field = asString(value.field);
  const op = asString(value.op);
  if (!field || !op || !FILTER_OPS.has(op as FilterOp)) {
    return null;
  }

  return {
    field,
    op: op as FilterOp,
    value: value.value,
    regex: asBoolean(value.regex) ?? false,
  };
}

function normalizeFilterGroup(value: unknown): FilterGroup {
  const node = normalizeFilterNode(value);
  if (node && ("all" in node || "any" in node)) {
    return node;
  }

  return { all: [] };
}

function normalizeView(path: string, raw: unknown): ViewFile | null {
  if (!isRecord(raw)) {
    return null;
  }

  const name = asString(raw.name);
  if (!name) {
    return null;
  }

  const filename = path.split("/").pop()?.replace(/\.ya?ml$/i, "") ?? name;

  return {
    filename,
    path,
    definition: {
      name,
      icon: asString(raw.icon),
      color: asString(raw.color),
      order: asNumber(raw.order),
      sort: asString(raw.sort),
      filters: normalizeFilterGroup(raw.filters),
      listPropertiesDisplay: asStringArray(raw.listPropertiesDisplay ?? raw.list_properties_display),
    },
  };
}

export async function loadTolariaViews(site: Site): Promise<LoadedViews> {
  try {
    const tree = await fetchRepositoryTree(site, site.branch);
    const viewPaths = tree
      .map((item) => item.path)
      .filter((path) => /^views\/[^/]+\.ya?ml$/i.test(path))
      .sort((left, right) => left.localeCompare(right));
    const views = await Promise.all(
      viewPaths.map(async (path) => {
        try {
          const file = await fetchRepositoryFile(site, path, site.branch);
          return normalizeView(path, load(file.text));
        } catch {
          return null;
        }
      }),
    );

    return {
      views: views
        .filter((view): view is ViewFile => Boolean(view))
        .sort((left, right) => {
          const leftOrder = left.definition.order ?? Number.POSITIVE_INFINITY;
          const rightOrder = right.definition.order ?? Number.POSITIVE_INFINITY;
          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }

          return left.definition.name.localeCompare(right.definition.name);
        }),
      error: null,
    };
  } catch (error) {
    return {
      views: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function propertyValue(entry: OwnerVaultEntry, field: string): VaultPropertyValue | undefined {
  const lower = field.toLowerCase();
  const propertyKey = Object.keys(entry.properties).find((key) => key.toLowerCase() === lower);
  return propertyKey ? entry.properties[propertyKey] : undefined;
}

function relationshipValue(entry: OwnerVaultEntry, field: string) {
  const lower = field.toLowerCase();
  const relationshipKey = Object.keys(entry.relationships).find((key) => key.toLowerCase() === lower);
  return relationshipKey ? entry.relationships[relationshipKey] : undefined;
}

function resolveField(entry: OwnerVaultEntry, field: string): ResolvedField {
  const lower = field.toLowerCase();
  if (lower === "type" || lower === "isa") {
    return { kind: "scalar", value: entry.noteType };
  }
  if (lower === "status") {
    return { kind: "scalar", value: entry.status };
  }
  if (lower === "title") {
    return { kind: "scalar", value: entry.title };
  }
  if (lower === "filename") {
    return { kind: "scalar", value: entry.path.split("/").pop() ?? entry.path };
  }
  if (lower === "path") {
    return { kind: "scalar", value: entry.path };
  }
  if (lower === "archived") {
    return { kind: "scalar", value: entry.archived };
  }
  if (lower === "favorite") {
    return { kind: "scalar", value: entry.favorite };
  }
  if (lower === "publish") {
    return { kind: "scalar", value: entry.publish };
  }
  if (lower === "visibility") {
    return { kind: "scalar", value: entry.visibility };
  }
  if (lower === "body") {
    return { kind: "scalar", value: entry.snippet };
  }

  const relationship = relationshipValue(entry, field);
  if (relationship) {
    return { kind: "array", values: relationship };
  }

  const property = propertyValue(entry, field);
  if (Array.isArray(property)) {
    return { kind: "array", values: property.map(String) };
  }

  return { kind: "scalar", value: property ?? null };
}

function filterString(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function isEmptyField(resolved: ResolvedField) {
  if (resolved.kind === "array") {
    return resolved.values.length === 0;
  }

  return resolved.value === null || resolved.value === "" || resolved.value === false;
}

function textMatches(field: string, expected: string, op: FilterOp, regex: boolean) {
  if (regex && (op === "equals" || op === "not_equals" || op === "contains" || op === "not_contains")) {
    try {
      const matched = new RegExp(expected, "i").test(field);
      return op === "equals" || op === "contains" ? matched : !matched;
    } catch {
      return false;
    }
  }

  const left = field.toLowerCase();
  const right = expected.toLowerCase();
  if (op === "equals") {
    return left === right;
  }
  if (op === "not_equals") {
    return left !== right;
  }
  if (op === "contains") {
    return left.includes(right);
  }
  if (op === "not_contains") {
    return !left.includes(right);
  }

  return false;
}

function timestamp(value: unknown) {
  if (typeof value === "number") {
    return value * 1000;
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function evaluateScalarCondition(condition: FilterCondition, value: string | number | boolean | null) {
  if (condition.op === "before" || condition.op === "after") {
    const left = timestamp(value);
    const right = timestamp(filterString(condition.value));
    if (left === null || right === null) {
      return false;
    }

    return condition.op === "before" ? left < right : left > right;
  }

  if (condition.op === "any_of" || condition.op === "none_of") {
    const expected = Array.isArray(condition.value) ? condition.value.map((item) => filterString(item).toLowerCase()) : [];
    const matched = expected.includes(filterString(value).toLowerCase());
    return condition.op === "any_of" ? matched : !matched;
  }

  return textMatches(filterString(value), filterString(condition.value), condition.op, condition.regex === true);
}

function evaluateArrayCondition(condition: FilterCondition, values: string[]) {
  if (condition.op === "any_of" || condition.op === "none_of") {
    const expected = Array.isArray(condition.value) ? condition.value.map((item) => filterString(item).toLowerCase()) : [];
    const matched = values.some((value) => expected.includes(value.toLowerCase()));
    return condition.op === "any_of" ? matched : !matched;
  }

  if (condition.op === "not_equals" || condition.op === "not_contains") {
    const positiveOp = condition.op === "not_equals" ? "equals" : "contains";
    return !values.some((value) =>
      textMatches(value, filterString(condition.value), positiveOp, condition.regex === true),
    );
  }

  return values.some((value) =>
    textMatches(value, filterString(condition.value), condition.op, condition.regex === true),
  );
}

function evaluateCondition(condition: FilterCondition, entry: OwnerVaultEntry) {
  const resolved = resolveField(entry, condition.field);
  if (condition.op === "is_empty") {
    return isEmptyField(resolved);
  }

  if (condition.op === "is_not_empty") {
    return !isEmptyField(resolved);
  }

  return resolved.kind === "array"
    ? evaluateArrayCondition(condition, resolved.values)
    : evaluateScalarCondition(condition, resolved.value);
}

function evaluateNode(node: FilterNode, entry: OwnerVaultEntry): boolean {
  if ("all" in node) {
    return node.all.every((child) => evaluateNode(child, entry));
  }

  if ("any" in node) {
    return node.any.some((child) => evaluateNode(child, entry));
  }

  return evaluateCondition(node, entry);
}

export function evaluateView(definition: ViewDefinition, entries: OwnerVaultEntry[]) {
  return entries.filter((entry) => evaluateNode(definition.filters, entry));
}

function parseSort(raw: string | null | undefined): SortConfig {
  if (!raw) {
    return { option: "modified", direction: "desc" };
  }

  const delimiter = raw.lastIndexOf(":");
  if (delimiter <= 0) {
    return { option: raw, direction: "asc" };
  }

  const option = raw.slice(0, delimiter);
  const direction = raw.slice(delimiter + 1);
  return {
    option,
    direction: direction === "desc" ? "desc" : "asc",
  };
}

function sortValue(entry: OwnerVaultEntry, option: string) {
  if (option === "title") {
    return entry.title;
  }
  if (option === "created") {
    return entry.createdAt.getTime();
  }
  if (option === "status") {
    return entry.status ?? "";
  }
  if (option === "modified") {
    return entry.updatedAt.getTime();
  }

  const propertyKey = option.startsWith("property:") ? option.slice("property:".length) : option;
  const value = propertyValue(entry, propertyKey);
  return Array.isArray(value) ? value.join(", ") : value ?? "";
}

function compareSortValues(left: unknown, right: unknown) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}

export function sortEntries(entries: OwnerVaultEntry[], sort: string | null | undefined) {
  const config = parseSort(sort);
  const direction = config.direction === "asc" ? 1 : -1;

  return [...entries].sort((left, right) => {
    const compared = compareSortValues(sortValue(left, config.option), sortValue(right, config.option));
    if (compared !== 0) {
      return compared * direction;
    }

    return left.title.localeCompare(right.title);
  });
}

export function filterEntriesBySelection(
  entries: OwnerVaultEntry[],
  views: ViewFile[],
  selection: VaultSelection,
) {
  if (selection.kind === "type") {
    return entries.filter((entry) => !entry.archived && entry.noteType === selection.type);
  }

  if (selection.kind === "view") {
    const view = views.find((candidate) => candidate.filename === selection.filename);
    return view ? evaluateView(view.definition, entries) : [];
  }

  if (selection.filter === "inbox") {
    return entries.filter((entry) => !entry.archived && !entry.organized);
  }

  if (selection.filter === "favorites") {
    return entries.filter((entry) => !entry.archived && entry.favorite);
  }

  if (selection.filter === "archived") {
    return entries.filter((entry) => entry.archived);
  }

  return entries.filter((entry) => !entry.archived);
}

export function queryEntries(entries: OwnerVaultEntry[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return entries;
  }

  return entries.filter((entry) => {
    const haystack = [
      entry.title,
      entry.path,
      entry.noteType,
      entry.status ?? "",
      entry.snippet ?? "",
      ...Object.values(entry.properties).map((value) => (Array.isArray(value) ? value.join(" ") : filterString(value))),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

export function sortForSelection(
  selection: VaultSelection,
  views: ViewFile[],
  definitions: Map<string, OwnerVaultEntry>,
) {
  if (selection.kind === "view") {
    return views.find((view) => view.filename === selection.filename)?.definition.sort ?? "modified:desc";
  }

  if (selection.kind === "type") {
    return definitions.get(selection.type)?.sort ?? "modified:desc";
  }

  return selection.kind === "filter" && selection.filter === "archived" ? "modified:desc" : "modified:desc";
}

export function displayPropertiesForEntry(
  entry: OwnerVaultEntry,
  definitions: Map<string, OwnerVaultEntry>,
  view?: ViewFile | null,
) {
  if (view?.definition.listPropertiesDisplay.length) {
    return view.definition.listPropertiesDisplay;
  }

  return definitions.get(entry.noteType)?.listPropertiesDisplay ?? [];
}

export function displayProperty(entry: OwnerVaultEntry, key: string) {
  const lower = key.toLowerCase();
  if (lower === "type") {
    return entry.noteType;
  }
  if (lower === "status") {
    return entry.status;
  }
  if (lower === "visibility") {
    return entry.visibility;
  }
  if (lower === "publish") {
    return entry.publish ? "published" : "unpublished";
  }

  const relationship = relationshipValue(entry, key);
  if (relationship?.length) {
    return relationship.join(", ");
  }

  const value = propertyValue(entry, key);
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value === null || value === undefined ? null : String(value);
}

export function selectedView(selection: VaultSelection, views: ViewFile[]) {
  return selection.kind === "view"
    ? views.find((view) => view.filename === selection.filename) ?? null
    : null;
}

function decodeSlug(value: string) {
  return value
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

export function rewriteOwnerNoteLinks(
  html: string,
  input: {
    siteSlug: string;
    siteId: string;
    entries: OwnerVaultEntry[];
  },
) {
  const slugToEntry = new Map(input.entries.map((entry) => [entry.slug, entry]));
  const publicPrefix = `/p/${input.siteSlug}/`;
  const ownerPrefix = `/dashboard/sites/${encodeURIComponent(input.siteId)}/notes`;

  return html.replace(/href="([^"]+)"/g, (match, href: string) => {
    if (!href.startsWith(publicPrefix)) {
      return match;
    }

    const slug = decodeSlug(href.slice(publicPrefix.length).split(/[?#]/)[0] ?? "");
    const entry = slugToEntry.get(slug);
    if (!entry) {
      return match;
    }

    return `href="${ownerPrefix}?note=${encodeURIComponent(entry.id)}"`;
  });
}
