import { describe, expect, it } from "vitest";
import { shouldPublishNote, shouldStoreRenderedHtml } from "../src/lib/ingest";
import { parseNoteDraft, renderNoteDraft } from "../src/lib/markdown";

describe("ingest storage policy", () => {
  it("stores rendered HTML for unpublished owner notes without publishing them", async () => {
    const draft = parseNoteDraft({
      siteId: "site_1",
      path: "domestic-festival-app-idea.md",
      sourceSha: "sha_1",
      markdown: `---
type: Resource
status: Active
---

# 국내 페스티벌 앱 아이디어

## 핵심 컨셉

국내 페스티벌 참가자를 위한 앱 아이디어.
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

    expect(draft.publish).toBe(false);
    expect(shouldPublishNote(draft, null)).toBe(false);
    expect(shouldStoreRenderedHtml(null)).toBe(true);
    expect(rendered.html).toContain("핵심 컨셉");
    expect(rendered.html).toContain("국내 페스티벌 참가자를 위한 앱 아이디어.");
  });

  it("does not store rendered HTML for notes with parse or conflict errors", () => {
    const draft = {
      publish: true,
      visibility: "public" as const,
    };

    expect(shouldPublishNote(draft, "slug conflict")).toBe(false);
    expect(shouldStoreRenderedHtml("slug conflict")).toBe(false);
  });
});
