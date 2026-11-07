import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium, expect } from "@playwright/test";

const execute = promisify(execFile);
const startAction = /Start job|Open session/;
const runRoute = /\/runs\/[^/]+$/;
const groundedTerms = /keycap|switch|inspect/i;
const serverDirectory = fileURLToPath(
  new URL("../apps/server/", import.meta.url)
);
const python = fileURLToPath(
  new URL("../apps/server/.venv/bin/python", import.meta.url)
);
const timeout = Number(process.env.TARA_PROVIDER_SMOKE_TIMEOUT_MS ?? 90_000);
const reference = process.env.TARA_PROVIDER_SMOKE_WORK_ORDER ?? "WO-1042";
const username = process.env.TARA_PROVIDER_SMOKE_USERNAME ?? "technician";
const password =
  process.env.TARA_PROVIDER_SMOKE_PASSWORD ?? process.env.DEMO_PASSWORD;
const origin = new URL(
  process.env.TARA_PROVIDER_SMOKE_ORIGIN ?? "http://localhost:3001"
);
const databaseUrl = process.env.TARA_SMOKE_DATABASE_URL;
const fixtureInspector = `
import asyncio, json, sys
from sqlalchemy import select
from tara_server.db.models import AgentOutput, TranscriptTurn, ToolCall
from tara_server.db.session import session_factory
async def main():
    async with session_factory() as session:
        outputs = (await session.scalars(select(AgentOutput).where(AgentOutput.run_id == sys.argv[1]))).all()
        turns = (await session.scalars(select(TranscriptTurn).where(TranscriptTurn.run_id == sys.argv[1]))).all()
        calls = (await session.scalars(select(ToolCall).where(ToolCall.run_id == sys.argv[1]))).all()
        print(json.dumps({
            "outputCount": len(outputs),
            "assistantTurnCount": sum(t.role == "assistant" for t in turns),
            "consultationOutputs": sum(o.mode == "consultation" for o in outputs),
            "cameraQuestions": sum(c.name == "inspect_camera" and c.status == "completed" for c in calls),
            "webSearches": sum(c.name == "search_web" and c.status == "completed" for c in calls),
        }))
asyncio.run(main())
`;

function check(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.safeSmokeMessage = true;
    throw error;
  }
}

async function inspectFixture(runId) {
  const result = await execute(python, ["-c", fixtureInspector, runId], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ENVIRONMENT: "test",
      EVIDENCE_BACKEND: "local",
    },
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
  });
  return JSON.parse(result.stdout);
}

async function runSmoke() {
  check(
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname),
    "This fixture smoke requires a local application origin."
  );
  check(
    databaseUrl?.startsWith("sqlite+aiosqlite:///"),
    "Set TARA_SMOKE_DATABASE_URL to the API/worker's isolated SQLite fixture database."
  );
  check(
    password,
    "Set TARA_PROVIDER_SMOKE_PASSWORD or DEMO_PASSWORD without writing credentials to files."
  );
  check(
    Number.isFinite(timeout) && timeout >= 10_000 && timeout <= 300_000,
    "Provider timeout must be between 10 and 300 seconds."
  );
  let stage = "launch synthetic camera browser";
  let browser;
  try {
    browser = await chromium.launch({
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
      executablePath: process.env.TARA_CHROMIUM_EXECUTABLE_PATH,
      headless: true,
    });
    const context = await browser.newContext({
      permissions: ["camera", "microphone"],
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    await page.addInitScript(() => {
      const state = { audioRequests: 0, audioTracks: [] };
      window.__taraProviderSmoke = state;
      const original = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices
      );
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (constraints?.audio) {
          state.audioRequests += 1;
        }
        const stream = await original(constraints);
        state.audioTracks.push(...stream.getAudioTracks());
        return stream;
      };
    });
    const api = async (path) => {
      const response = await page.request.get(
        new URL(`/api/v1${path}`, origin).href
      );
      check(response.ok(), "An authenticated fixture API read failed.");
      return await response.json();
    };
    stage = "login and open isolated assigned work order";
    await page.goto(new URL("/login", origin).href);
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { exact: true, name: "Sign in" }).click();
    await page.waitForURL(origin.href);
    const queue = await api("/work-orders");
    const work = queue.items.find((item) => item.reference === reference);
    check(
      work,
      "The isolated fixture must contain the requested assigned work order."
    );
    const card = page
      .locator("article.work-order")
      .filter({ hasText: reference });
    await card.getByRole("button", { name: startAction }).click();
    await page.waitForURL(runRoute);
    const runId = new URL(page.url()).pathname.split("/").at(-1);
    const snapshot = () => api(`/runs/${runId}`);
    const initial = await snapshot();
    check(
      initial.currentStepId === initial.steps[0].id &&
        initial.steps.every((step) => step.attempts.length === 0),
      "Use a fresh isolated fixture: this smoke must begin before the first attempt."
    );
    check(
      initial.steps[0].verification.kind === "attestation" &&
        initial.steps[1].verification.kind === "visual",
      "The fixture must begin with an attestation followed by a physical-switch visual inspection."
    );
    check(
      (await inspectFixture(runId)).outputCount === 0,
      "The fresh fixture already has agent outputs."
    );
    stage = "connect actual worker silently";
    await page
      .getByRole("button", { exact: true, name: "Connect assistant" })
      .click();
    const confirm = page.getByRole("button", {
      exact: true,
      name: "I confirm this step",
    });
    await expect(confirm).toBeEnabled({ timeout });
    await expect(
      page.getByRole("textbox", { name: "Message TARa" })
    ).toBeDisabled();
    check(
      await page.evaluate(() => window.__taraProviderSmoke.audioRequests === 0),
      "The microphone was requested before explicit consultation."
    );
    let records = await inspectFixture(runId);
    check(
      records.outputCount === 0 && records.assistantTurnCount === 0,
      "Joining produced unsolicited agent output or a greeting."
    );
    stage = "quiet first attestation";
    await confirm.click();
    await expect
      .poll(async () => (await snapshot()).steps[0].status, { timeout })
      .toBe("attested");
    records = await inspectFixture(runId);
    check(
      records.outputCount === 0 && records.assistantTurnCount === 0,
      "A correct attestation produced unsolicited agent output."
    );
    check(
      await page.evaluate(() => window.__taraProviderSmoke.audioRequests === 0),
      "Silent execution requested the microphone."
    );
    stage = "one synthetic-camera rejection with exact evidence bytes";
    await page
      .getByRole("button", { exact: true, name: "Enable bench camera" })
      .click();
    await expect
      .poll(
        async () =>
          await page
            .locator("video")
            .evaluate((video) => video.readyState >= 2),
        { timeout }
      )
      .toBe(true);
    // Worker automatic check runs on entry/track readiness. No scripted verdict is injected.
    await expect
      .poll(
        async () => {
          const run = await snapshot();
          return run.steps[1].attempts.length;
        },
        { timeout }
      )
      .toBeGreaterThan(0);
    const rejected = await snapshot();
    const attempt = rejected.steps[1].attempts.at(-1);
    check(
      ["rejected", "unclear"].includes(attempt.outcome),
      "The real provider did not safely reject the synthetic camera's missing physical switch; inspect this test privately."
    );
    check(
      rejected.currentStepId === initial.steps[1].id,
      "Rejected test media advanced the current step."
    );
    const evidence = rejected.evidence.find(
      (item) => item.attemptId === attempt.id
    );
    check(
      evidence &&
        !evidence.accepted &&
        evidence.assessmentId &&
        evidence.source === "test_media",
      "The rejected assessment needs correlated evidence explicitly labeled test_media (set EVIDENCE_SOURCE=test_media on the isolated worker)."
    );
    const signed = await api(`/evidence/${evidence.id}/url`);
    const object = await page.request.get(new URL(signed.url, origin).href);
    check(object.ok(), "The authorized evidence link could not be read.");
    const sha256 = createHash("sha256")
      .update(await object.body())
      .digest("hex");
    check(
      sha256 === evidence.sha256 && evidence.width > 0 && evidence.height > 0,
      "The stored rejected frame does not match its recorded SHA-256/dimensions."
    );
    check(
      rejected.alerts.some(
        (alert) => alert.attemptId === attempt.id && alert.eventId
      ),
      "The rejection has no eligible linked visual correction."
    );
    stage = "explicit typed consultation";
    const beforeConsultation = await inspectFixture(runId);
    await page.getByRole("button", { exact: true, name: "Ask TARa" }).click();
    const composer = page.getByRole("textbox", { name: "Message TARa" });
    await expect(composer).toBeEnabled({ timeout });
    await composer.fill(
      "Using the approved SOP context, why must the keycap be removed before inspecting the switch? Please answer briefly."
    );
    await page
      .getByRole("button", { exact: true, name: "Send message" })
      .click();
    await expect
      .poll(
        async () => {
          const current = await inspectFixture(runId);
          return (
            current.consultationOutputs >
              beforeConsultation.consultationOutputs &&
            current.assistantTurnCount > beforeConsultation.assistantTurnCount
          );
        },
        { timeout }
      )
      .toBe(true);
    await expect(page.locator(".consultation-answer p")).toContainText(
      groundedTerms,
      { timeout }
    );
    stage = "read-only camera question through the actual model tool";
    const beforeCameraQuestion = await snapshot();
    const beforeCameraRecords = await inspectFixture(runId);
    await composer.fill(
      "Use inspect_camera to look at the current camera frame and briefly describe what is visible. This is a question only; do not verify, retry or advance any procedure step."
    );
    await page
      .getByRole("button", { exact: true, name: "Send message" })
      .click();
    await expect
      .poll(async () => (await inspectFixture(runId)).cameraQuestions, {
        timeout,
      })
      .toBeGreaterThan(beforeCameraRecords.cameraQuestions);
    await expect
      .poll(async () => (await inspectFixture(runId)).consultationOutputs, {
        timeout,
      })
      .toBeGreaterThan(beforeCameraRecords.consultationOutputs);
    const afterCameraQuestion = await snapshot();
    check(
      afterCameraQuestion.version === beforeCameraQuestion.version &&
        afterCameraQuestion.currentStepId ===
          beforeCameraQuestion.currentStepId &&
        afterCameraQuestion.steps[1].attempts.length ===
          beforeCameraQuestion.steps[1].attempts.length &&
        afterCameraQuestion.evidence.length ===
          beforeCameraQuestion.evidence.length,
      "A read-only camera question changed execution state or verification evidence."
    );
    stage = "real cited public web references through the actual model tool";
    const beforeWeb = await inspectFixture(runId);
    await composer.fill(
      "Use search_web for public official LiveKit Python OpenAI Realtime documentation. Show the source links; do not change any SOP step."
    );
    await page
      .getByRole("button", { exact: true, name: "Send message" })
      .click();
    await expect
      .poll(async () => (await inspectFixture(runId)).webSearches, { timeout })
      .toBeGreaterThan(beforeWeb.webSearches);
    await expect(
      page.locator('.tool-result a[href^="https://"]').first()
    ).toBeVisible({ timeout });
    await page.keyboard.press("Escape");
    stage = "return to silent and stop microphone";
    await page
      .getByRole("button", { exact: true, name: "Return to silent mode" })
      .click();
    await expect(composer).toBeDisabled({ timeout });
    await expect
      .poll(async () => (await snapshot()).interactionMode, { timeout })
      .toBe("silent");
    await expect
      .poll(
        async () =>
          await page.evaluate(() =>
            window.__taraProviderSmoke.audioTracks.every(
              (track) => !track.enabled || track.readyState === "ended"
            )
          ),
        { timeout }
      )
      .toBe(true);
    const activity = await api(`/runs/${runId}/activity`);
    check(
      activity.items.some((item) => item.type === "consultation.activated") &&
        activity.items.some((item) => item.type === "consultation.deactivated"),
      "Consultation mode changes were not audited."
    );
    process.stdout.write(
      `${JSON.stringify({ checks: ["silent join", "silent correct attestation", "real-provider synthetic-frame rejection", "evidence SHA-256 linkage", "typed consultation", "read-only camera question", "real cited web search", "microphone stops on silent"], evidenceId: evidence.id, runId, scope: "Synthetic camera plumbing smoke; no vision accuracy claim.", status: "passed" })}\n`
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ error: error.safeSmokeMessage ? error.message : "A browser/provider operation failed or timed out; inspect runtime logs privately.", stage, status: "failed" })}\n`
    );
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

if (process.env.RUN_PROVIDER_SMOKE === "1") {
  await runSmoke();
} else {
  process.stdout.write(
    "Provider smoke skipped. Set RUN_PROVIDER_SMOKE=1 plus local fixture/runtime configuration to opt in.\n"
  );
}
