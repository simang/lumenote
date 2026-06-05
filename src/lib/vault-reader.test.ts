import { describe, expect, it } from "vitest";
import {
  evaluateView,
  filterEntriesBySelection,
  sortEntries,
  toOwnerVaultEntries,
  type ViewDefinition,
} from "./vault-reader";
import type { OwnerNoteSummary } from "./repositories";

function note(input: {
  id: string;
  title: string;
  frontmatter: Record<string, unknown>;
  snippet?: string | null;
  updatedAt?: Date;
}): OwnerNoteSummary {
  return {
    id: input.id,
    site_id: "site_1",
    path: `${input.id}.md`,
    source_sha: "sha",
    slug: input.id,
    title: input.title,
    description: null,
    publish: false,
    visibility: "private",
    frontmatter: input.frontmatter,
    lumenote: {
      publish: false,
      visibility: "private",
      theme: "default",
      nav: true,
      backlinks: true,
      comments: false,
      access: {
        password: null,
        expires_at: null,
        allowlist: [],
      },
    },
    body_hash: "hash",
    parse_error: null,
    published_at: null,
    deleted_at: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: input.updatedAt ?? new Date("2026-01-02T00:00:00Z"),
    snippet: input.snippet ?? null,
  };
}

describe("vault-reader", () => {
  it("classifies inbox, favorites, and archived notes from Tolaria frontmatter", () => {
    const entries = toOwnerVaultEntries([
      note({ id: "project", title: "Project", frontmatter: { type: "Project", _favorite: true } }),
      note({ id: "organized", title: "Organized", frontmatter: { type: "Note", _organized: true } }),
      note({ id: "archived", title: "Archived", frontmatter: { type: "Resource", status: "Archived" } }),
      note({ id: "type", title: "Project", frontmatter: { type: "Type" } }),
    ]);

    expect(filterEntriesBySelection(entries, [], { kind: "filter", filter: "inbox" }).map((entry) => entry.id)).toEqual(["project"]);
    expect(filterEntriesBySelection(entries, [], { kind: "filter", filter: "favorites" }).map((entry) => entry.id)).toEqual(["project"]);
    expect(filterEntriesBySelection(entries, [], { kind: "filter", filter: "archived" }).map((entry) => entry.id)).toEqual(["archived"]);
  });

  it("evaluates saved view filters and property sort rules", () => {
    const entries = toOwnerVaultEntries([
      note({
        id: "later",
        title: "Later",
        frontmatter: { type: "Project", status: "Active", due: "2026-07-01" },
      }),
      note({
        id: "sooner",
        title: "Sooner",
        frontmatter: { type: "Project", status: "Active", due: "2026-06-01" },
      }),
      note({
        id: "resource",
        title: "Resource",
        frontmatter: { type: "Resource", status: "Active" },
      }),
    ]);
    const view: ViewDefinition = {
      name: "Active Projects",
      icon: null,
      color: null,
      order: null,
      sort: "property:due:asc",
      listPropertiesDisplay: [],
      filters: {
        all: [
          { field: "type", op: "equals", value: "Project" },
          { field: "status", op: "not_equals", value: "Archived" },
        ],
      },
    };

    expect(sortEntries(evaluateView(view, entries), view.sort).map((entry) => entry.id)).toEqual(["sooner", "later"]);
  });
});
