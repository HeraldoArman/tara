import { describe, expect, test } from "bun:test";

import { createPreviewAnalysis } from "../../apps/web/src/components/sop-intelligence/preview-analysis";
import { readDocument } from "../../apps/web/src/components/sop-intelligence/read-document";
import { sampleAnalysis } from "../../apps/web/src/components/sop-intelligence/sample-analysis";

describe("SOP source-linked previews", () => {
  test("groups separate heading and body paragraphs from document extraction", async () => {
    const document = await readDocument(
      new File(
        [
          "1. Identify the device\n\nRead the serial number.\n\nRecord it in the work order.\n\n2. Release\n\nRequest supervisor approval.",
        ],
        "procedure.txt"
      ),
      new AbortController().signal
    );
    expect(document.sections.map((section) => section.text)).toEqual([
      "Read the serial number.\n\nRecord it in the work order.",
      "Request supervisor approval.",
    ]);
  });
  test("keeps repeated headings linked to their own source passages", async () => {
    const source =
      "# Inspect\nCheck the label.\n\n# Inspect\nCheck the housing.";
    const document = await readDocument(
      new File([source], "procedure.md"),
      new AbortController().signal
    );
    const analysis = createPreviewAnalysis(document);

    expect(document.sections.map((section) => section.text)).toEqual([
      "Check the label.",
      "Check the housing.",
    ]);
    expect(new Set(document.sections.map((section) => section.id)).size).toBe(
      2
    );
    expect(analysis.opportunities.map((item) => item.sectionId)).toEqual(
      document.sections.map((section) => section.id)
    );
  });

  test("keeps restrictions and physical safety ahead of assistance keywords", async () => {
    const document = await readDocument(
      new File(
        [
          "Do not use the camera to inspect this label.\n\nDisconnect electrical power and record the result.\n\nA supervisor must approve the visual inspection.",
        ],
        "safety.txt"
      ),
      new AbortController().signal
    );

    expect(
      createPreviewAnalysis(document).opportunities.map((item) => item.category)
    ).toEqual(["human-performed", "human-performed", "human-approval"]);
  });

  test("rejects unreadable or empty source content instead of substituting the sample", async () => {
    await expect(
      readDocument(
        new File([" \n\n "], "empty.txt"),
        new AbortController().signal
      )
    ).rejects.toThrow("No readable text");
    await expect(
      readDocument(
        new File([new Uint8Array([255, 254, 0])], "binary.txt"),
        new AbortController().signal
      )
    ).rejects.toThrow();
  });

  test("does not return an analysis after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readDocument(
        new File(["Check the label."], "procedure.txt"),
        controller.signal
      )
    ).rejects.toThrow();
  });

  test("every sample card resolves to a unique existing passage", () => {
    const sourceIds = new Set(
      sampleAnalysis.document.sections.map((section) => section.id)
    );
    expect(sourceIds.size).toBe(sampleAnalysis.document.sections.length);
    expect(
      sampleAnalysis.opportunities.every((item) =>
        sourceIds.has(item.sectionId)
      )
    ).toBe(true);
    expect(
      new Set(sampleAnalysis.opportunities.map((item) => item.id)).size
    ).toBe(sampleAnalysis.opportunities.length);
  });
});
