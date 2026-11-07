import { Badge } from "@tara/ui/components/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@tara/ui/components/empty";
import { ToggleGroup, ToggleGroupItem } from "@tara/ui/components/toggle-group";
import { ArrowUpRight, Check, Hand, ScanEye, Sparkles } from "lucide-react";
import { type MouseEvent, useCallback } from "react";

import {
  canAssist,
  categoryLabels,
  type Opportunity,
  type OpportunityFilter,
} from "./types";

interface OpportunityPanelProps {
  filter: OpportunityFilter;
  onFilterChange: (filter: OpportunityFilter) => void;
  onSelect: (opportunity: Opportunity) => void;
  opportunities: Opportunity[];
  selectedId: string | null;
}

export function OpportunityPanel({
  opportunities,
  selectedId,
  filter,
  onFilterChange,
  onSelect,
}: OpportunityPanelProps) {
  const changeFilter = useCallback(
    (values: string[]) => {
      const [value] = values;
      if (value === "all" || value === "assist" || value === "human") {
        onFilterChange(value);
      }
    },
    [onFilterChange]
  );
  const selectOpportunity = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const opportunity = opportunities.find(
        (item) => item.id === event.currentTarget.value
      );
      if (opportunity) {
        onSelect(opportunity);
      }
    },
    [opportunities, onSelect]
  );
  const assistCount = opportunities.filter((item) =>
    canAssist(item.category)
  ).length;
  const visible = opportunities.filter((item) => {
    if (filter === "all") {
      return true;
    }
    return canAssist(item.category) === (filter === "assist");
  });

  return (
    <aside
      aria-labelledby="opportunity-heading"
      className="sop-opportunity-panel"
    >
      <header className="sop-opportunity-heading">
        <div className="sop-panel-title">
          <span className="sop-icon-tile sop-icon-tile-accent">
            <Sparkles aria-hidden="true" />
          </span>
          <div>
            <h2 id="opportunity-heading">AI opportunity map</h2>
            <p>A closer look at where TARA can help.</p>
          </div>
        </div>
        <Badge variant="outline">Preview</Badge>
      </header>

      <div className="sop-opportunity-filters">
        <ToggleGroup
          aria-label="Filter opportunities"
          onValueChange={changeFilter}
          value={[filter]}
        >
          <ToggleGroupItem value="all">
            All <span>{opportunities.length}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="assist">
            Can assist <span>{assistCount}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="human">
            Human-led <span>{opportunities.length - assistCount}</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <p className="sop-map-hint">
        <ScanEye aria-hidden="true" /> Select a card to highlight the original
        passage.
      </p>

      <div className="sop-opportunity-scroll">
        {visible.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScanEye />
              </EmptyMedia>
              <EmptyTitle>No matching opportunities</EmptyTitle>
              <EmptyDescription>
                Choose another filter to explore this document.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol className="sop-opportunity-list">
            {visible.map((opportunity) => {
              const index = opportunities.indexOf(opportunity);
              const assist = canAssist(opportunity.category);
              const selected = selectedId === opportunity.id;
              return (
                <li key={opportunity.id}>
                  <button
                    aria-controls={`passage-${opportunity.sectionId}`}
                    aria-pressed={selected}
                    className="sop-opportunity-card"
                    data-tone={assist ? "assist" : "human"}
                    onClick={selectOpportunity}
                    type="button"
                    value={opportunity.id}
                  >
                    <span className="sop-opportunity-topline">
                      <span className="sop-opportunity-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <Badge className="sop-category" variant="outline">
                        {assist ? (
                          <Sparkles aria-hidden="true" />
                        ) : (
                          <Hand aria-hidden="true" />
                        )}
                        {categoryLabels[opportunity.category]}
                      </Badge>
                      <span className="sop-opportunity-source">
                        {selected ? (
                          <Check aria-hidden="true" />
                        ) : (
                          <ArrowUpRight aria-hidden="true" />
                        )}
                      </span>
                    </span>
                    <span className="sop-opportunity-title">
                      {opportunity.title}
                    </span>
                    <span className="sop-opportunity-reason">
                      {opportunity.reason}
                    </span>
                    <span className="sop-capabilities">
                      {opportunity.capabilities.map((capability) => (
                        <span key={capability}>{capability}</span>
                      ))}
                    </span>
                    {selected ? (
                      <span className="sop-source-linked">
                        <span /> Source passage highlighted
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <footer className="sop-map-footer">
        <span className="sop-state-dot" />
        Suggestions are ready for your review
      </footer>
    </aside>
  );
}
