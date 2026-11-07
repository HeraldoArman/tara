import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  evaluationQuery,
  formatRate,
  initialDashboardFilters,
  recordedCount,
  recordedSteps,
  runOutcomes,
} from "../../apps/web/src/components/dashboard/owner-dashboard-data";
import { ownerEvaluationFixture } from "../fixtures/owner-dashboard-data";

test("run composition preserves unclassified statuses without turning alerts into warnings", () => {
  expect(runOutcomes(ownerEvaluationFixture)).toEqual([
    { key: "completed", label: "Complete", value: 12 },
    { key: "active", label: "Active or paused", value: 4 },
    { key: "partial", label: "Partial", value: 3 },
    { key: "other", label: "Other statuses", value: 1 },
  ]);
});

test("unknown optional metrics stay unavailable and known zero stays zero", () => {
  for (const value of [
    undefined,
    null,
    "0",
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    expect(recordedCount(value)).toBeNull();
  }
  expect(recordedCount(0)).toBe(0);
  expect(formatRate(null)).toBe("—");
  expect(formatRate(0)).toBe("0.0%");
  expect(formatRate(0.875)).toBe("87.5%");
});

test("SOP and UTC range filters use the evaluation API contract", () => {
  expect(evaluationQuery(initialDashboardFilters)).toBe("/evaluation/summary");
  const query = evaluationQuery({
    from: "2026-11-01",
    sopId: "sop/one & two",
    to: "2026-11-07",
  });
  const parsed = new URL(query, "http://localhost");
  expect(parsed.searchParams.get("sopId")).toBe("sop/one & two");
  expect(parsed.searchParams.get("from")).toBe("2026-11-01");
  expect(parsed.searchParams.get("to")).toBe("2026-11-07");
});

test("step detail keeps version identities and skips malformed records", () => {
  const data = {
    ...ownerEvaluationFixture,
    stepMetrics: [
      ...ownerEvaluationFixture.stepMetrics,
      { ...ownerEvaluationFixture.stepMetrics[0], firstPass: "yes" },
      { ...ownerEvaluationFixture.stepMetrics[0], held: undefined },
      {
        attempts: 1,
        firstPass: 1,
        held: 0,
        runs: 1,
        stepId: "missing-identity",
      },
      null,
    ],
  };
  expect(recordedSteps(data)).toEqual([
    {
      attempts: 8,
      firstPass: 5,
      held: 2,
      id: "keyboard-v1:inspect-switch",
      runs: 7,
      sopVersionId: "keyboard-v1",
      stepId: "inspect-switch",
      stepTitle: "Inspect the faulty switch",
      version: "1.0",
    },
    {
      attempts: 7,
      firstPass: 7,
      held: 0,
      id: "keyboard-v1:disconnect-power",
      runs: 7,
      sopVersionId: "keyboard-v1",
      stepId: "disconnect-power",
      stepTitle: "Disconnect power",
      version: "1.0",
    },
  ]);
});

test("matching step IDs in different SOP versions retain separate counts and row identities", () => {
  const [firstVersion] = ownerEvaluationFixture.stepMetrics;
  const steps = recordedSteps({
    stepMetrics: [
      firstVersion,
      {
        ...firstVersion,
        attempts: 3,
        firstPass: 1,
        held: 1,
        id: "keyboard-v2:inspect-switch",
        runs: 2,
        sopVersionId: "keyboard-v2",
        stepTitle: "Inspect the exposed switch",
        version: "2.0",
      },
    ],
  });
  expect(steps.map(({ id }) => id)).toEqual([
    "keyboard-v1:inspect-switch",
    "keyboard-v2:inspect-switch",
  ]);
  expect(steps.map(({ attempts }) => attempts)).toEqual([8, 3]);
  expect(steps.map(({ version }) => version)).toEqual(["1.0", "2.0"]);
  expect(steps.map(({ stepTitle }) => stepTitle)).toEqual([
    "Inspect the faulty switch",
    "Inspect the exposed switch",
  ]);
});

test("owner dashboard route enforces authorization and renders real API outcomes", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--tsconfig-override",
      "apps/web/tsconfig.json",
      "tests/fixtures/owner-dashboard-route-check.tsx",
    ],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Owner dashboard route checks passed");
});
