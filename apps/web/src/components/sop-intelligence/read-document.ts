import type { SopDocument, SourceSection } from "./types";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PAGES = 50;
const MAX_CHARACTERS = 150_000;
const MAX_SECTIONS = 250;
const SUPPORTED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md"]);
const EXTENSION = /\.([^.]+)$/;
const PARAGRAPH_BREAK =
  /\n\s*\n|\n(?=\s*(?:#{1,6}\s|\d+(?:\.\d+)*[.)]\s|[-•*]\s))/u;
const HEADING = /^(?:#{1,6}\s+|\d+(?:\.\d+)*(?:[.)]|\s)\s*)/u;
const MARKDOWN_HEADING = /^#{1,6}\s+/;
const LINE_BREAKS = /\r\n?/g;
const FILE_EXTENSION = /\.[^.]+$/;

export function validateDocument(file: File): string | null {
  const extension = EXTENSION.exec(file.name)?.[1]?.toLowerCase();
  if (!(extension && SUPPORTED_EXTENSIONS.has(extension))) {
    return "Choose a PDF, DOCX, TXT, or Markdown document.";
  }
  if (file.size === 0) {
    return "This file is empty. Choose a document with readable text.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "This file is too large. Choose a document smaller than 10 MB.";
  }
  return null;
}

function extractSections(text: string, page: number | null): SourceSection[] {
  const paragraphs = text
    .replace(LINE_BREAKS, "\n")
    .split(PARAGRAPH_BREAK)
    .map((part) => part.trim())
    .filter(Boolean);
  const sections: SourceSection[] = [];
  let currentHeading: SourceSection | undefined;

  for (const paragraph of paragraphs) {
    const [firstLine = "", ...rest] = paragraph.split("\n");
    const hasHeading = HEADING.test(firstLine) && firstLine.length < 110;
    if (!hasHeading && currentHeading) {
      currentHeading.text = currentHeading.text
        ? `${currentHeading.text}\n\n${paragraph}`
        : paragraph;
      continue;
    }
    const section: SourceSection = {
      heading: hasHeading
        ? firstLine.replace(MARKDOWN_HEADING, "")
        : `Passage ${sections.length + 1}`,
      id: `source-${page ?? 0}-${sections.length + 1}`,
      page,
      text: hasHeading ? rest.join("\n").trim() : paragraph,
    };
    sections.push(section);
    currentHeading = hasHeading ? section : undefined;
  }
  return sections;
}

async function readPdf(file: File, signal: AbortSignal) {
  const pdfjs = await import("pdfjs-dist");
  signal.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const task = pdfjs.getDocument({
    data: await file.arrayBuffer(),
    useSystemFonts: true,
  });
  const abort = () => {
    task.destroy().catch(() => {
      // A cancelled parser may already have terminated its worker.
    });
  };
  signal.addEventListener("abort", abort, { once: true });

  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PAGES) {
      throw new Error("Choose a PDF with 50 pages or fewer.");
    }
    const sections: SourceSection[] = [];
    let characters = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      signal.throwIfAborted();
      // biome-ignore lint/performance/noAwaitInLoops: Read pages in sequence to bound PDF parsing memory.
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => {
          if (!("str" in item)) {
            return "";
          }
          return `${item.str}${item.hasEOL ? "\n" : " "}`;
        })
        .join("");
      characters += text.length;
      if (characters > MAX_CHARACTERS) {
        throw new Error(
          "This document contains too much text. Upload a shorter SOP."
        );
      }
      sections.push(...extractSections(text, pageNumber));
      page.cleanup();
    }
    if (sections.length === 0) {
      throw new Error(
        "This PDF has no readable text. Use a text-based PDF or export an OCR copy first."
      );
    }
    return { pageCount: pdf.numPages, sections };
  } finally {
    signal.removeEventListener("abort", abort);
    await task.destroy();
  }
}

async function readText(file: File, extension: string): Promise<string> {
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });
    return result.value;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(
    await file.arrayBuffer()
  );
  if (text.includes("\0")) {
    throw new Error(
      "This file contains binary data. Choose a UTF-8 text document."
    );
  }
  return text;
}

export async function readDocument(
  file: File,
  signal: AbortSignal
): Promise<SopDocument> {
  const error = validateDocument(file);
  if (error) {
    throw new Error(error);
  }
  const extension = EXTENSION.exec(file.name)?.[1]?.toLowerCase() ?? "txt";
  signal.throwIfAborted();
  let sections: SourceSection[];
  let pageCount: number | null = null;

  if (extension === "pdf") {
    ({ sections, pageCount } = await readPdf(file, signal));
  } else {
    const text = await readText(file, extension);
    if (text.length > MAX_CHARACTERS) {
      throw new Error(
        "This document contains too much text. Upload a shorter SOP."
      );
    }
    sections = extractSections(text, null);
  }

  signal.throwIfAborted();
  if (sections.length === 0) {
    throw new Error(
      "No readable text was found. Choose a document with written instructions."
    );
  }
  if (sections.length > MAX_SECTIONS) {
    throw new Error(
      "This document has too many passages. Upload an SOP with 250 passages or fewer."
    );
  }
  return {
    format: extension.toUpperCase(),
    id: crypto.randomUUID(),
    name: file.name,
    origin: "upload",
    pageCount,
    sections,
    size: file.size,
    title: file.name.replace(FILE_EXTENSION, ""),
  };
}
