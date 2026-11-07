"use client";
import { ArrowUpRight, ImagePlus } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { ReferenceMedia, SopVersion } from "@/lib/contracts";

export function ReferenceMediaCards({ items }: { items: ReferenceMedia[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const view = async (item: ReferenceMedia) => {
    setError("");
    try {
      const result = await api<{ url: string }>(`/sop-media/${item.id}/url`);
      setUrls((prior) => ({ ...prior, [item.id]: result.url }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div className="reference-media-grid">
      {items.map((item) => (
        <article className="reference-media-card" key={item.id}>
          {urls[item.id] ? (
            <a href={urls[item.id]} rel="noopener noreferrer" target="_blank">
              <Image
                alt={`${item.title}. Source: ${item.heading}${item.page ? `, page ${item.page}` : ""}`}
                height={item.height || 360}
                src={urls[item.id]}
                unoptimized
                width={item.width || 640}
              />
            </a>
          ) : (
            <button
              className="reference-image-placeholder"
              onClick={() => view(item)}
              type="button"
            >
              <ImagePlus size={25} />
              <span>View reference image</span>
            </button>
          )}
          <h4>{item.title}</h4>
          <p>
            {item.heading}
            {item.page ? ` · p. ${item.page}` : ""}
          </p>
          {urls[item.id] ? (
            <button
              className="text-button"
              onClick={() => view(item)}
              type="button"
            >
              Refresh image link
              <ArrowUpRight size={11} />
            </button>
          ) : null}
        </article>
      ))}
      {error ? (
        <p className="notice danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SopReferenceUpload({
  version,
  onAttached,
  disabled,
}: {
  version: SopVersion;
  onAttached: (saved: SopVersion) => void;
  disabled: boolean;
}) {
  const [stepId, setStepId] = useState(version.definition.steps[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = version.definition.steps.find((step) => step.id === stepId);
  const source = selected?.sources[0];
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!source) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      form.set("heading", source.heading);
      if (source.page) {
        form.set("page", String(source.page));
      }
      const media = await api<ReferenceMedia>(
        `/sop-versions/${version.id}/media`,
        { body: form, method: "POST" }
      );
      const definition = {
        ...version.definition,
        steps: version.definition.steps.map((step) =>
          step.id === stepId
            ? {
                ...step,
                referenceMediaIds: [
                  ...new Set([...(step.referenceMediaIds ?? []), media.id]),
                ],
              }
            : step
        ),
      };
      const saved = await api<SopVersion>(`/sop-versions/${version.id}`, {
        body: JSON.stringify({ definition }),
        method: "PATCH",
      });
      onAttached(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="reference-upload" onSubmit={submit}>
      <h3>
        <ImagePlus size={17} />
        Add a source reference image
      </h3>
      <p>
        Attach an approved diagram or photograph to a procedure step. Images
        retain their source citation.
      </p>
      <label htmlFor="reference-step">Procedure step</label>
      <select
        disabled={disabled || busy}
        id="reference-step"
        onChange={(event) => setStepId(event.target.value)}
        value={stepId}
      >
        {version.definition.steps.map((step) => (
          <option key={step.id} value={step.id}>
            {step.title}
          </option>
        ))}
      </select>
      <label htmlFor="reference-title">Image title</label>
      <input
        disabled={disabled || busy}
        id="reference-title"
        maxLength={200}
        name="title"
        placeholder="For example: correctly seated switch"
        required
      />
      <label htmlFor="reference-file">PNG, JPEG or WebP image</label>
      <input
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled || busy}
        id="reference-file"
        name="file"
        required
        type="file"
      />
      <p className="subtle-note">
        Source: {source?.heading}
        {source?.page ? ` · p. ${source.page}` : ""}
      </p>
      {disabled ? (
        <p className="subtle-note">
          Save your edits before attaching a reference.
        </p>
      ) : null}
      {error ? (
        <div className="notice danger" role="alert">
          {error}
        </div>
      ) : null}
      <button
        className="button"
        disabled={disabled || busy || !source}
        type="submit"
      >
        {busy ? "Attaching reference…" : "Attach image to step"}
      </button>
    </form>
  );
}
