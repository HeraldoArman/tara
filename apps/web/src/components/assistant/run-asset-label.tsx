"use client";

import "./run-asset-label.css";

import { Button } from "@tara/ui/components/button";
import { LoaderCircle, ScanText } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { api, errorMessage } from "@/lib/api";
import type { Run } from "@/lib/contracts";
import type { useRunSession } from "@/lib/use-run-session";

const UNKNOWN_IDENTITY = "Not provided";
type RunSession = ReturnType<typeof useRunSession>;
interface LabelReading {
  assetModel: string | null;
  assetSerial: string | null;
  limitations: string[];
  responseId: string;
  visibleText: string;
  visionModel: string;
}

function useAssetLabel(run: Run, session: RunSession, canOperate: boolean) {
  const modelMissing = run.workOrder.asset.model === UNKNOWN_IDENTITY;
  const serialMissing = run.workOrder.asset.serial === UNKNOWN_IDENTITY;
  const [model, setModel] = useState(
    modelMissing ? "" : run.workOrder.asset.model
  );
  const [serial, setSerial] = useState(
    serialMissing ? "" : run.workOrder.asset.serial
  );
  const [label, setLabel] = useState<LabelReading | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const { action, refresh } = session;
  const canRead =
    canOperate &&
    session.connection === "connected" &&
    session.camera &&
    run.status === "active" &&
    !session.busy &&
    !reading &&
    !saving;
  const editable =
    canOperate &&
    run.status === "active" &&
    run.workOrder.reference.startsWith("TARA-SESSION-") &&
    (modelMissing || serialMissing);

  useEffect(() => {
    if (!modelMissing) {
      setModel(run.workOrder.asset.model);
    }
    if (!serialMissing) {
      setSerial(run.workOrder.asset.serial);
    }
  }, [
    modelMissing,
    serialMissing,
    run.workOrder.asset.model,
    run.workOrder.asset.serial,
  ]);

  const readLabel = useCallback(async () => {
    if (!canRead) {
      return;
    }
    setReading(true);
    setError("");
    try {
      const result = await action("assistant.read_label");
      const next = result?.label as LabelReading | undefined;
      if (
        !next ||
        typeof next.visibleText !== "string" ||
        !Array.isArray(next.limitations)
      ) {
        throw new Error(
          "The label could not be read. Try a closer, steadier view."
        );
      }
      setLabel(next);
      if (modelMissing && typeof next.assetModel === "string") {
        setModel(next.assetModel);
      }
      if (serialMissing && typeof next.assetSerial === "string") {
        setSerial(next.assetSerial);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setReading(false);
    }
  }, [action, canRead, modelMissing, serialMissing]);

  const save = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editable || reading || saving || registered || session.busy) {
        return;
      }
      setSaving(true);
      setError("");
      setMessage("");
      let persisted = false;
      try {
        if (!(model.trim() && serial.trim())) {
          throw new Error(
            "Enter both the model and serial number before saving."
          );
        }
        await api<Run>(`/runs/${encodeURIComponent(run.id)}/asset`, {
          body: JSON.stringify({
            model: modelMissing ? model.trim() : run.workOrder.asset.model,
            serial: serialMissing ? serial.trim() : run.workOrder.asset.serial,
          }),
          method: "PATCH",
        });
        persisted = true;
        setRegistered(true);
        setMessage(
          "Identity saved. Check the current frame to assess it against the procedure."
        );
        await refresh();
      } catch (cause) {
        setError(
          persisted
            ? "Identity was saved, but the session could not refresh. Reconnect before checking the frame."
            : errorMessage(cause)
        );
      } finally {
        setSaving(false);
      }
    },
    [
      editable,
      model,
      modelMissing,
      reading,
      refresh,
      registered,
      run.id,
      run.workOrder.asset.model,
      run.workOrder.asset.serial,
      saving,
      serial,
      serialMissing,
      session.busy,
    ]
  );
  const changeModel = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setModel(event.currentTarget.value),
    []
  );
  const changeSerial = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      setSerial(event.currentTarget.value),
    []
  );

  return {
    canRead,
    changeModel,
    changeSerial,
    editable,
    error,
    label,
    message,
    model,
    modelMissing,
    reading,
    readLabel,
    registered,
    save,
    saving,
    serial,
    serialMissing,
  };
}

function LabelObservation({ label }: { label: LabelReading }) {
  return (
    <div className="tara-label-observation">
      <h3>Visible label text</h3>
      {label.visibleText ? (
        <pre>{label.visibleText}</pre>
      ) : (
        <p>No legible label text was found.</p>
      )}
      <dl>
        <div>
          <dt>Read model</dt>
          <dd>{label.assetModel ?? "Not legible"}</dd>
        </div>
        <div>
          <dt>Read serial</dt>
          <dd>{label.assetSerial ?? "Not legible"}</dd>
        </div>
      </dl>
      {label.limitations.length ? (
        <ul>
          {label.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RunAssetLabel({
  run,
  session,
  canOperate,
}: {
  run: Run;
  session: RunSession;
  canOperate: boolean;
}) {
  const identity = useAssetLabel(run, session, canOperate);
  return (
    <section
      aria-label="Model and serial label"
      className="tara-run-asset-label"
    >
      <div className="tara-run-label-heading">
        <h2>
          <ScanText aria-hidden="true" />
          Model and serial label
        </h2>
        <Button
          disabled={!identity.canRead}
          onClick={identity.readLabel}
          size="sm"
          variant="outline"
        >
          {identity.reading ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : null}
          {identity.reading ? "Reading label…" : "Read model label"}
        </Button>
      </div>
      <p>
        Bring the printed model and serial label close to the camera. Keep it
        steady and fill the frame.
      </p>
      <p>
        Reading a label does not verify the current step. Review the text before
        saving any identity.
      </p>
      {identity.label ? <LabelObservation label={identity.label} /> : null}
      {identity.editable ? (
        <form onSubmit={identity.save}>
          <div className="tara-run-identity-fields">
            <div>
              <label htmlFor="run-asset-model">Model</label>
              <input
                disabled={
                  identity.reading || identity.saving || identity.registered
                }
                id="run-asset-model"
                maxLength={200}
                onChange={identity.changeModel}
                readOnly={!identity.modelMissing}
                required
                value={identity.model}
              />
            </div>
            <div>
              <label htmlFor="run-asset-serial">Serial number</label>
              <input
                disabled={
                  identity.reading || identity.saving || identity.registered
                }
                id="run-asset-serial"
                maxLength={200}
                onChange={identity.changeSerial}
                readOnly={!identity.serialMissing}
                required
                value={identity.serial}
              />
            </div>
          </div>
          <p>
            Confirm the missing details against the label. Existing identity
            details stay unchanged.
          </p>
          <Button
            disabled={
              identity.reading ||
              identity.saving ||
              identity.registered ||
              Boolean(session.busy)
            }
            type="submit"
          >
            {identity.saving ? "Saving identity…" : "Save identity"}
          </Button>
        </form>
      ) : null}
      {identity.message ? (
        <p className="tara-run-label-message" role="status">
          {identity.message}
        </p>
      ) : null}
      {identity.error ? (
        <p className="tara-run-label-error" role="alert">
          {identity.error}
        </p>
      ) : null}
    </section>
  );
}
