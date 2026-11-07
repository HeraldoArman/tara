import { Button } from "@tara/ui/components/button";
import { FileText, Minus, Plus, ScanText } from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { findSourceHighlight, highlightDescription } from "./source-highlight";
import { canAssist, type Opportunity, type SopDocument } from "./types";

interface DocumentPanelProps {
  document: SopDocument;
  selected: Opportunity | undefined;
  selectionCount: number;
}

export function DocumentPanel({
  document,
  selected,
  selectionCount,
}: DocumentPanelProps) {
  const [zoom, setZoom] = useState(100);
  const viewport = useRef<HTMLElement>(null);
  const activeSection = useRef<HTMLElement>(null);
  const activeHighlight = useRef<HTMLElement>(null);
  const highlight = findSourceHighlight(document, selected);
  const previousSelection = useRef({ count: selectionCount, id: selected?.id });
  const pages = [
    ...new Set(
      document.sections
        .map((section) => section.page)
        .filter((page): page is number => typeof page === "number")
    ),
  ].sort((a, b) => a - b);
  const goToPage = useCallback(
    (page: number) => {
      const section = document.sections.find((item) => item.page === page);
      const container = viewport.current;
      const target =
        section &&
        container?.querySelector(
          `[data-source-id="${CSS.escape(section.id)}"]`
        );
      if (container && target) {
        container.scrollTo({
          behavior: "smooth",
          top:
            target.getBoundingClientRect().top -
            container.getBoundingClientRect().top +
            container.scrollTop -
            20,
        });
      }
    },
    [document.sections]
  );
  const handlePageChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      goToPage(Number(event.target.value));
      event.target.value = "";
    },
    [goToPage]
  );
  const zoomOut = useCallback(() => setZoom((value) => value - 10), []);
  const zoomIn = useCallback(() => setZoom((value) => value + 10), []);

  useEffect(() => {
    const target = activeHighlight.current ?? activeSection.current;
    const container = viewport.current;
    const changed =
      previousSelection.current.id !== selected?.id ||
      previousSelection.current.count !== selectionCount;
    previousSelection.current = { count: selectionCount, id: selected?.id };
    if (!(target && container && changed)) {
      return;
    }
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "instant"
      : "smooth";
    if (window.matchMedia("(max-width: 900px)").matches) {
      target.scrollIntoView({ behavior, block: "center" });
      return;
    }
    container.scrollTo({
      behavior,
      top:
        target.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop -
        70,
    });
  }, [selected?.id, selectionCount]);

  return (
    <section aria-labelledby="document-heading" className="sop-document-panel">
      <header className="sop-panel-heading">
        <div className="sop-panel-title">
          <span className="sop-icon-tile">
            <FileText aria-hidden="true" />
          </span>
          <div>
            <h2 id="document-heading">
              {document.sourceKind === "procedure-definition"
                ? "Saved procedure"
                : "Source document"}
            </h2>
            <p title={document.name}>{document.name}</p>
          </div>
        </div>
        <span className="sop-file-format">{document.format}</span>
      </header>

      <div className="sop-document-toolbar">
        <span>
          <ScanText aria-hidden="true" />{" "}
          {document.sourceKind === "procedure-definition"
            ? "Procedure definition · original source unavailable"
            : "Extracted text"}
        </span>
        {pages.length > 1 ? (
          <label>
            <span className="sr-only">Go to page</span>
            <select
              aria-label="Go to page"
              defaultValue=""
              onChange={handlePageChange}
            >
              <option disabled value="">
                Go to page
              </option>
              {pages.map((page) => (
                <option key={page} value={page}>
                  Page {page}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <fieldset className="sop-zoom">
          <legend className="sr-only">Document text size</legend>
          <Button
            aria-label="Decrease document text size"
            disabled={zoom <= 80}
            onClick={zoomOut}
            size="icon-xs"
            variant="ghost"
          >
            <Minus />
          </Button>
          <output aria-label="Text zoom">{zoom}%</output>
          <Button
            aria-label="Increase document text size"
            disabled={zoom >= 150}
            onClick={zoomIn}
            size="icon-xs"
            variant="ghost"
          >
            <Plus />
          </Button>
        </fieldset>
      </div>

      <section
        aria-label="SOP document text"
        className="sop-document-viewport"
        ref={viewport}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable source document must be keyboard accessible.
        tabIndex={0}
      >
        <article className="sop-paper" style={{ fontSize: `${zoom}%` }}>
          <header className="sop-paper-heading">
            <div className="sop-paper-kicker">
              <span>STANDARD OPERATING PROCEDURE</span>
              <FileText aria-hidden="true" />
            </div>
            <h3>{document.title}</h3>
            <div className="sop-paper-meta">
              <span>{document.name}</span>
              <span>{document.sections.length} source passages</span>
            </div>
          </header>
          {document.origin === "sample" ? (
            <div className="sop-paper-context">
              <h4>Purpose &amp; scope</h4>
              <p>
                A sample procedure for replacing a faulty switch on a supported
                hot-swap keyboard. For trained service technicians.
              </p>
            </div>
          ) : null}
          <div className="sop-source-sections">
            {document.sections.map((section, index) => {
              const active = selected?.sectionId === section.id;
              const range =
                highlight?.sectionId === section.id ? highlight : null;
              const tone =
                selected && canAssist(selected.category) ? "assist" : "human";
              return (
                <section
                  aria-label={section.heading}
                  className="sop-source-section"
                  data-selected={active}
                  data-source-id={section.id}
                  data-tone={active ? tone : undefined}
                  id={`passage-${section.id}`}
                  key={section.id}
                  ref={active ? activeSection : undefined}
                >
                  <span aria-hidden="true" className="sop-source-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h4>{section.heading}</h4>
                    {section.text ? (
                      <p>
                        {range
                          ? (range.ranges ?? [range]).map(
                              (part, partIndex, parts) => (
                                <span key={`${part.start}-${part.end}`}>
                                  {section.text.slice(
                                    partIndex === 0
                                      ? 0
                                      : parts[partIndex - 1].end,
                                    part.start
                                  )}
                                  <mark
                                    data-opportunity-id={selected?.id}
                                    ref={
                                      partIndex === 0
                                        ? activeHighlight
                                        : undefined
                                    }
                                  >
                                    {section.text.slice(part.start, part.end)}
                                  </mark>
                                  {partIndex === parts.length - 1
                                    ? section.text.slice(part.end)
                                    : null}
                                </span>
                              )
                            )
                          : section.text}
                      </p>
                    ) : null}
                    {section.page ? (
                      <span className="sop-source-page">
                        Page {section.page}
                      </span>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
          <footer className="sop-paper-footer">END OF DOCUMENT</footer>
        </article>
      </section>

      <footer className="sop-document-footer">
        <span>
          {document.pageCount
            ? `${document.pageCount} pages`
            : `${document.sections.length} passages`}
        </span>
        <span>
          {selected
            ? highlightDescription(highlight)
            : "Select a card to locate its source"}
        </span>
      </footer>
    </section>
  );
}
