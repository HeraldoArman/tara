"use client";

import { ArrowUpRight, ChartNoAxesCombined, ChevronDown } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useId,
  useState,
} from "react";

import "./dashboard-charts.css";

interface StateCounts {
  active: number;
  success: number;
  warning: number;
}

interface TrendPoint extends StateCounts {
  date: string;
}

interface ComparisonPoint extends StateCounts {
  code: string;
  id: string;
  label: string;
}

const series = [
  { dash: undefined, key: "active", label: "Active" },
  { dash: "8 5", key: "warning", label: "Warning" },
  { dash: "2 5", key: "success", label: "Success" },
] as const;

const numberFormatter = new Intl.NumberFormat("en-US");
const shortDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fullDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});
const PLOT_WIDTH = 600;
const PLOT_HEIGHT = 200;

function formatDate(date: string, full = false): string {
  const value = new Date(`${date}T00:00:00Z`);
  return (full ? fullDateFormatter : shortDateFormatter).format(value);
}

function axisScale(values: readonly StateCounts[]) {
  const highest = Math.max(
    0,
    ...values.flatMap((value) => [value.active, value.warning, value.success])
  );
  const roughStep = Math.max(1, highest / 4);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const interval =
    ([1, 2, 5, 10].find((value) => value >= normalized) ?? 10) * magnitude;
  const maximum = Math.max(interval, Math.ceil(highest / interval) * interval);
  return {
    highest,
    maximum,
    ticks: Array.from(
      { length: maximum / interval + 1 },
      (_, index) => index * interval
    ),
  };
}

function pointX(index: number, length: number): number {
  return length === 1 ? PLOT_WIDTH / 2 : (index / (length - 1)) * PLOT_WIDTH;
}

function dateLabelIndices(length: number): number[] {
  const count = Math.min(5, length);
  if (count <= 1) {
    return [0];
  }
  return Array.from({ length: count }, (_, index) =>
    Math.round((index / (count - 1)) * (length - 1))
  );
}

export function StateLegend() {
  return (
    <ul aria-label="Assistant states" className="tara-chart-legend">
      {series.map((item) => (
        <li data-series={item.key} key={item.key}>
          <span aria-hidden="true" className="tara-chart-line-key" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function ChartEmpty({ description }: { description: string }) {
  return (
    <div className="tara-chart-empty">
      <ChartNoAxesCombined
        aria-hidden="true"
        className="tara-chart-empty-icon"
      />
      <p>{description}</p>
    </div>
  );
}

function DayReadout({ point }: { point: TrendPoint }) {
  return (
    <div aria-atomic="true" className="tara-chart-readout" role="status">
      <time dateTime={point.date}>{formatDate(point.date, true)}</time>
      <dl>
        {series.map((item) => (
          <div data-series={item.key} key={item.key}>
            <dt>{item.label}</dt>
            <dd>{numberFormatter.format(point[item.key])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TrendDataTable({ data }: { data: readonly TrendPoint[] }) {
  return (
    <details className="tara-chart-data">
      <summary>
        View daily counts <ChevronDown aria-hidden="true" />
      </summary>
      <div className="tara-chart-table-wrap">
        <table>
          <caption>
            Daily assistant state entries in the selected period
          </caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              {series.map((item) => (
                <th key={item.key} scope="col">
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.date}>
                <th scope="row">{formatDate(point.date)}</th>
                {series.map((item) => (
                  <td key={item.key}>
                    {numberFormatter.format(point[item.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

interface TrendPlotProps {
  data: readonly TrendPoint[];
  maximum: number;
  onSelect: (date: string) => void;
  selectedIndex: number;
  ticks: readonly number[];
}

function TrendPlot({
  data,
  maximum,
  onSelect,
  selectedIndex,
  ticks,
}: TrendPlotProps) {
  const titleId = useId();
  const helpId = useId();
  const selectPointer = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const position = (event.clientX - bounds.left) / bounds.width;
      const index = Math.max(
        0,
        Math.min(data.length - 1, Math.round(position * (data.length - 1)))
      );
      const point = data[index];
      if (point) {
        onSelect(point.date);
      }
    },
    [data, onSelect]
  );
  const selectKeyboard = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const positions: Record<string, number> = {
        ArrowLeft: Math.max(0, selectedIndex - 1),
        ArrowRight: Math.min(data.length - 1, selectedIndex + 1),
        End: data.length - 1,
        Home: 0,
      };
      const index = positions[event.key];
      if (index === undefined) {
        return;
      }
      event.preventDefault();
      const point = data[index];
      if (point) {
        onSelect(point.date);
      }
    },
    [data, onSelect, selectedIndex]
  );

  return (
    <>
      <div className="tara-trend-canvas">
        <div aria-hidden="true" className="tara-trend-y-axis">
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / maximum) * 100}%` }}>
              {numberFormatter.format(tick)}
            </span>
          ))}
        </div>
        <button
          aria-describedby={helpId}
          aria-label="Explore daily state counts"
          className="tara-trend-plot"
          onKeyDown={selectKeyboard}
          onPointerDown={selectPointer}
          onPointerMove={selectPointer}
          type="button"
        >
          <svg
            aria-labelledby={titleId}
            preserveAspectRatio="none"
            role="img"
            viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
          >
            <title id={titleId}>
              Daily Active, Warning, and Success entries, plotted from zero
            </title>
            {ticks.map((tick) => (
              <line
                className="tara-chart-grid-line"
                key={tick}
                vectorEffect="non-scaling-stroke"
                x1={0}
                x2={PLOT_WIDTH}
                y1={PLOT_HEIGHT * (1 - tick / maximum)}
                y2={PLOT_HEIGHT * (1 - tick / maximum)}
              />
            ))}
            <line
              className="tara-chart-crosshair"
              vectorEffect="non-scaling-stroke"
              x1={pointX(selectedIndex, data.length)}
              x2={pointX(selectedIndex, data.length)}
              y1={0}
              y2={PLOT_HEIGHT}
            />
            {series.map((item) => (
              <polyline
                className="tara-chart-series"
                data-series={item.key}
                key={item.key}
                points={data
                  .map(
                    (point, index) =>
                      `${pointX(index, data.length)},${PLOT_HEIGHT * (1 - point[item.key] / maximum)}`
                  )
                  .join(" ")}
                strokeDasharray={item.dash}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {series.map((item) => (
              <circle
                className="tara-chart-selected-point"
                cx={pointX(selectedIndex, data.length)}
                cy={
                  PLOT_HEIGHT *
                  (1 - (data[selectedIndex]?.[item.key] ?? 0) / maximum)
                }
                data-series={item.key}
                key={item.key}
                r={3.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </button>
      </div>
      <div
        aria-hidden="true"
        className="tara-trend-x-axis"
        data-label-count={Math.min(5, data.length)}
      >
        {dateLabelIndices(data.length).map((index) => (
          <span
            key={data[index]?.date}
            style={{
              left: `${(pointX(index, data.length) / PLOT_WIDTH) * 100}%`,
            }}
          >
            {formatDate(data[index]?.date ?? "1970-01-01")}
          </span>
        ))}
      </div>
      <p className="tara-chart-help" id={helpId}>
        Hover or tap to inspect a day. Use arrow keys when the chart is focused.
      </p>
    </>
  );
}

export function StateTrendChart({ data }: { data: readonly TrendPoint[] }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const scale = axisScale(data);
  const matchingIndex = data.findIndex((point) => point.date === selectedDate);
  const selectedIndex = matchingIndex < 0 ? data.length - 1 : matchingIndex;
  const selected = data[selectedIndex];

  if (!selected) {
    return (
      <ChartEmpty description="No daily state entries for this selection." />
    );
  }

  return (
    <figure className="tara-state-trend">
      <StateLegend />
      <DayReadout point={selected} />
      {scale.highest === 0 ? (
        <ChartEmpty description="No state entries were recorded in this period." />
      ) : (
        <TrendPlot
          data={data}
          maximum={scale.maximum}
          onSelect={setSelectedDate}
          selectedIndex={selectedIndex}
          ticks={scale.ticks}
        />
      )}
      <TrendDataTable data={data} />
    </figure>
  );
}

function ComparisonBars({
  maximum,
  point,
}: {
  maximum: number;
  point: ComparisonPoint;
}) {
  return (
    <dl className="tara-comparison-bars">
      {series.map((item) => (
        <div
          className="tara-comparison-series"
          data-series={item.key}
          key={item.key}
        >
          <dt>{item.label}</dt>
          <dd>
            <span aria-hidden="true" className="tara-comparison-track">
              <span
                className="tara-comparison-fill"
                style={{ width: `${(point[item.key] / maximum) * 100}%` }}
              />
            </span>
            <span className="tara-comparison-count">
              {numberFormatter.format(point[item.key])}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SopComparisonChart({
  data,
  onSelect,
}: {
  data: readonly ComparisonPoint[];
  onSelect: (id: string) => void;
}) {
  const { maximum } = axisScale(data);
  const selectSop = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const id = event.currentTarget.dataset.sopId;
      if (id) {
        onSelect(id);
      }
    },
    [onSelect]
  );

  if (data.length === 0) {
    return <ChartEmpty description="No procedures match this selection." />;
  }

  return (
    <figure className="tara-sop-comparison">
      <figcaption>
        State entries · shared scale from 0 to {numberFormatter.format(maximum)}
      </figcaption>
      <ol>
        {data.map((point) => (
          <li key={point.id}>
            <button
              aria-label={`Inspect ${point.label}`}
              className="tara-comparison-sop"
              data-sop-id={point.id}
              onClick={selectSop}
              type="button"
            >
              <span>
                <strong>{point.label}</strong>
                <span>{point.code}</span>
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="tara-comparison-arrow"
              />
            </button>
            <ComparisonBars maximum={maximum} point={point} />
          </li>
        ))}
      </ol>
    </figure>
  );
}
