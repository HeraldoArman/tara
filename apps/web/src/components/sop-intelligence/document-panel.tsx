import { Button } from "@tara/ui/components/button";
import { FileText, Minus, Plus, ScanText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { canAssist, type Opportunity, type SopDocument } from "./types";

interface DocumentPanelProps {
  document: SopDocument;
  selected: Opportunity | undefined;
}

export function DocumentPanel({ document, selected }: DocumentPanelProps) {
  const [zoom, setZoom] = useState(100);
  const viewport = useRef<HTMLElement>(null);
  const activeSection = useRef<HTMLElement>(null);
  const previousSelection = useRef(selected?.id);
  const zoomOut = useCallback(() => setZoom((value) => value - 10), []);
  const zoomIn = useCallback(() => setZoom((value) => value + 10), []);

  useEffect(() => {
    const target = activeSection.current;
    const container = viewport.current;
    const changed = previousSelection.current !== selected?.id;
    previousSelection.current = selected?.id;
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
  }, [selected?.id]);

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
              const tone =
                selected && canAssist(selected.category) ? "assist" : "human";
              return (
                <section
                  aria-label={section.heading}
                  className="sop-source-section"
                  data-selected={active}
                  data-tone={active ? tone : undefined}
                  id={`passage-${section.id}`}
                  key={section.id}
                  ref={active ? activeSection : undefined}
                >
                  <span aria-hidden="true" className="sop-source-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h4>
                      {active && !section.text ? (
                        <mark>{section.heading}</mark>
                      ) : (
                        section.heading
                      )}
                    </h4>
                    {section.text ? (
                      <p>
                        {active ? <mark>{section.text}</mark> : section.text}
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
        <span>Select an opportunity to locate its source</span>
      </footer>
    </section>
  );
}
