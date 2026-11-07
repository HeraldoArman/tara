"use client";

import "./create-work-order.css";

import { Button } from "@tara/ui/components/button";
import { Input } from "@tara/ui/components/input";
import { Textarea } from "@tara/ui/components/textarea";
import { ArrowRight, CheckCircle2, LoaderCircle, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Run, User, WorkOrder } from "@/lib/contracts";

export interface PublishedProcedureOption {
  id: string;
  label: string;
}

function requiredText(data: FormData, name: string, label: string): string {
  const value = data.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Enter ${label}.`);
  }
  return value.trim();
}

function CreatedJob({
  assignee,
  assignedToYou,
  busy,
  created,
  error,
  onStartSession,
}: {
  assignee?: User;
  assignedToYou: boolean;
  busy: boolean;
  created: WorkOrder;
  error: string;
  onStartSession: () => Promise<void>;
}) {
  return (
    <section className="panel create-job-result">
      <div className="notice create-job-confirmation" role="status">
        <CheckCircle2 aria-hidden="true" size={20} />
        <div>
          <strong>Job created: {created.reference}</strong>
          <p>
            {created.title} is assigned to{" "}
            {assignee?.name ?? "the selected person"}.
            {assignedToYou
              ? " You can start your video session now."
              : " They can open Work queue and select Start video session."}
          </p>
        </div>
      </div>
      {error ? (
        <div className="notice danger" role="alert">
          {error}
        </div>
      ) : null}
      <div className="form-actions">
        <Link className="button" href="/dashboard#work-queue">
          View work queue <ArrowRight aria-hidden="true" size={16} />
        </Link>
        {assignedToYou ? (
          <Button disabled={busy} onClick={onStartSession} type="button">
            {busy ? (
              <LoaderCircle
                aria-hidden="true"
                className="spin"
                data-icon="inline-start"
              />
            ) : (
              <Play aria-hidden="true" data-icon="inline-start" />
            )}
            {busy ? "Opening session…" : "Start video session"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function CreateWorkOrder({
  assignees,
  currentUserId,
  initialSopVersionId,
  procedures,
}: {
  assignees: User[];
  currentUserId: string;
  initialSopVersionId: string;
  procedures: PublishedProcedureOption[];
}) {
  const router = useRouter();
  const [created, setCreated] = useState<WorkOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<WorkOrder>("/work-orders", {
        body: JSON.stringify({
          asset: {
            model: requiredText(data, "model", "the equipment or work area"),
            serial: requiredText(data, "serial", "the asset or location ID"),
          },
          assignedUsername: requiredText(
            data,
            "assignedUsername",
            "an assignee"
          ),
          estimatedMinutes: Number(data.get("estimatedMinutes")),
          issue: requiredText(data, "issue", "the work to be done"),
          priority: data.get("priority"),
          reference: requiredText(data, "reference", "a work reference"),
          sopVersionId: requiredText(
            data,
            "sopVersionId",
            "an approved procedure"
          ),
          title: requiredText(data, "title", "a job title"),
        }),
        method: "POST",
      });
      setCreated(result);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? "This work reference is already in use. Choose a different reference and try again."
          : errorMessage(cause)
      );
    } finally {
      setBusy(false);
    }
  };

  const startSession = async () => {
    if (!created || created.assignedTo !== currentUserId) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const run = await api<Run>(`/work-orders/${created.id}/runs`, {
        method: "POST",
      });
      router.push(`/runs/${run.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <CreatedJob
        assignedToYou={created.assignedTo === currentUserId}
        assignee={assignees.find((person) => person.id === created.assignedTo)}
        busy={busy}
        created={created}
        error={error}
        onStartSession={startSession}
      />
    );
  }

  if (!(procedures.length && assignees.length)) {
    return (
      <section className="panel create-job-result">
        <h2>Prepare your first job.</h2>
        {procedures.length ? null : (
          <p>Publish an approved procedure before creating a job.</p>
        )}
        {assignees.length ? null : (
          <p>
            An active technician or owner is required before a job can be
            assigned.
          </p>
        )}
        <div className="form-actions">
          <Link className="button" href="/dashboard#work-queue">
            View work queue
          </Link>
          {procedures.length ? null : (
            <Link className="button primary" href="/sops">
              Open SOP library <ArrowRight aria-hidden="true" size={16} />
            </Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <form
      aria-busy={busy}
      autoComplete="off"
      className="panel create-job-form"
      onSubmit={submit}
    >
      <fieldset disabled={busy}>
        <legend>Procedure and assignment</legend>
        <p className="create-job-help" id="job-assignment-help">
          Assigned jobs appear in that person’s work queue. Choose yourself to
          run the session on this account.
        </p>
        <div className="create-job-grid">
          <div className="create-job-field">
            <label htmlFor="job-sop">Approved procedure</label>
            <select
              defaultValue={initialSopVersionId}
              id="job-sop"
              name="sopVersionId"
              required
            >
              <option disabled value="">
                Choose a published procedure
              </option>
              {procedures.map((procedure) => (
                <option key={procedure.id} value={procedure.id}>
                  {procedure.label}
                </option>
              ))}
            </select>
          </div>
          <div className="create-job-field">
            <label htmlFor="job-assignee">Assign to</label>
            <select
              aria-describedby="job-assignment-help"
              defaultValue=""
              id="job-assignee"
              name="assignedUsername"
              required
            >
              <option disabled value="">
                Choose a technician or yourself
              </option>
              {assignees.map((person) => (
                <option key={person.id} value={person.username}>
                  {person.name} ({person.username})
                  {person.id === currentUserId ? " · You" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Work details</legend>
        <div className="create-job-grid">
          <div className="create-job-field">
            <label htmlFor="job-reference">Work reference</label>
            <Input
              id="job-reference"
              maxLength={100}
              name="reference"
              placeholder="e.g. WO-1042"
              required
              spellCheck={false}
            />
          </div>
          <div className="create-job-field">
            <label htmlFor="job-title">Job title</label>
            <Input
              id="job-title"
              maxLength={300}
              name="title"
              placeholder="e.g. Replace the faulty switch"
              required
            />
          </div>
          <div className="create-job-field">
            <label htmlFor="job-model">Equipment or work area</label>
            <Input
              id="job-model"
              maxLength={200}
              name="model"
              placeholder="e.g. Keychron K2"
              required
            />
          </div>
          <div className="create-job-field">
            <label htmlFor="job-serial">Asset or location ID</label>
            <Input
              id="job-serial"
              maxLength={200}
              name="serial"
              placeholder="e.g. KBD-042"
              required
              spellCheck={false}
            />
          </div>
          <div className="create-job-field create-job-wide">
            <label htmlFor="job-issue">Work to be done</label>
            <Textarea
              id="job-issue"
              maxLength={4000}
              name="issue"
              placeholder="Describe the issue and the expected result…"
              required
              rows={4}
            />
          </div>
          <div className="create-job-field">
            <label htmlFor="job-priority">Priority</label>
            <select
              defaultValue="standard"
              id="job-priority"
              name="priority"
              required
            >
              <option value="standard">Standard</option>
              <option value="priority">Priority</option>
            </select>
          </div>
          <div className="create-job-field">
            <label htmlFor="job-minutes">Estimated minutes</label>
            <Input
              defaultValue={20}
              id="job-minutes"
              max={10_080}
              min={1}
              name="estimatedMinutes"
              required
              step={1}
              type="number"
            />
          </div>
        </div>
      </fieldset>
      {error ? (
        <div className="notice danger" role="alert">
          {error}
        </div>
      ) : null}
      <div className="form-actions">
        <Link className="button" href="/dashboard#work-queue">
          Cancel
        </Link>
        <Button disabled={busy} type="submit">
          {busy ? (
            <LoaderCircle
              aria-hidden="true"
              className="spin"
              data-icon="inline-start"
            />
          ) : null}
          {busy ? "Creating job…" : "Create job"}
        </Button>
      </div>
    </form>
  );
}
