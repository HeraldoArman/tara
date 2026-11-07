"use client";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Issue } from "@/lib/contracts";
import { Status } from "./ui";

export function Escalations({
  items,
  canResolve,
  onResolved,
}: {
  items: Issue[];
  canResolve: boolean;
  onResolved: () => Promise<unknown>;
}) {
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const resolve = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/escalations/${selected}/resolve`, {
        body: JSON.stringify({ resolution: note }),
        method: "POST",
      });
      await onResolved();
      setSelected("");
      setNote("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="live-escalations">
      <h3>Recorded escalations</h3>
      {items.length ? (
        items.map((item) => (
          <article className="issue-record" key={item.id}>
            <Status value={item.status} />
            <p>{item.reason ?? item.description ?? "Recorded escalation"}</p>
            {canResolve && item.status === "open" ? (
              <button
                className="text-button"
                onClick={() => setSelected(item.id)}
                type="button"
              >
                Add supervisor resolution
              </button>
            ) : null}
          </article>
        ))
      ) : (
        <p className="subtle-note">No escalations have been recorded.</p>
      )}
      {selected ? (
        <form className="resolution-form" onSubmit={resolve}>
          <label htmlFor="escalation-resolution">Resolution note</label>
          <textarea
            id="escalation-resolution"
            maxLength={4000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Record the permitted recovery. Resolving an escalation does not verify a failed step."
            required
            rows={4}
            value={note}
          />
          <button
            className="button primary"
            disabled={busy || !note.trim()}
            type="submit"
          >
            <CheckCircle2 size={15} />
            Resolve escalation
          </button>
        </form>
      ) : null}
      {error ? (
        <div className="notice danger" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
