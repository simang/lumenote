import { describe, expect, it } from "vitest";
import { parseNoteDraft, renderNoteDraft } from "../src/lib/markdown";
import type { ResolverNote } from "../src/lib/types";

describe("markdown parser", () => {
  it("uses only lumenote namespaced publish config", () => {
    const draft = parseNoteDraft({
      siteId: "site_1",
      path: "Notes/Example Note.md",
      sourceSha: "sha_1",
      markdown: `---
title: Example
publish: true
slug: ignored
lumenote:
  publish: true
  slug: canonical
---
# Heading
`,
    });

    expect(draft.publish).toBe(true);
    expect(draft.slug).toBe("canonical");
    expect(draft.title).toBe("Example");
  });

  it("renders public wikilinks and leaves private targets as text", async () => {
    const publicTarget: ResolverNote = {
      id: "note_public",
      path: "Target.md",
      title: "Target",
      slug: "target",
      publish: true,
      visibility: "public",
      deleted_at: null,
      parse_error: null,
    };
    const privateTarget: ResolverNote = {
      id: "note_private",
      path: "Secret.md",
      title: "Secret",
      slug: "secret",
      publish: false,
      visibility: "private",
      deleted_at: null,
      parse_error: null,
    };
    const draft = parseNoteDraft({
      siteId: "site_1",
      path: "Index.md",
      sourceSha: "sha_1",
      markdown: `---
lumenote:
  publish: true
---
See [[Target|public target]] and [[Secret]].
`,
    });

    const rendered = await renderNoteDraft(draft, {
      resolveNote(target) {
        if (target === "Target") {
          return { status: "resolved", note: publicTarget, href: "/p/site/target" };
        }
        if (target === "Secret") {
          return { status: "private", note: privateTarget };
        }
        return { status: "unresolved" };
      },
      resolveAsset() {
        return null;
      },
    });

    expect(rendered.html).toContain('href="/p/site/target"');
    expect(rendered.html).toContain("Secret");
    expect(rendered.html).not.toContain("secret");
    expect(rendered.outgoingLinks).toHaveLength(2);
  });

  it("removes a leading H1 when it duplicates the resolved title", async () => {
    const draft = parseNoteDraft({
      siteId: "site_1",
      path: "Daily.md",
      sourceSha: "sha_1",
      markdown: `# Daily

Body content.
`,
    });

    const rendered = await renderNoteDraft(draft, {
      resolveNote() {
        return { status: "unresolved" };
      },
      resolveAsset() {
        return null;
      },
    });

    expect(draft.title).toBe("Daily");
    expect(rendered.html).not.toContain("<h1");
    expect(rendered.html).toContain("<p>Body content.</p>");
  });

  it("preserves GFM task list checkbox markup", async () => {
    const draft = parseNoteDraft({
      siteId: "site_1",
      path: "Tasks.md",
      sourceSha: "sha_1",
      markdown: `# Tasks

- [ ] Open task
- [x] Done task
`,
    });

    const rendered = await renderNoteDraft(draft, {
      resolveNote() {
        return { status: "unresolved" };
      },
      resolveAsset() {
        return null;
      },
    });

    expect(rendered.html).toContain("contains-task-list");
    expect(rendered.html).toContain("task-list-item");
    expect(rendered.html).toContain('type="checkbox"');
    expect(rendered.html).toContain("checked");
  });
});
