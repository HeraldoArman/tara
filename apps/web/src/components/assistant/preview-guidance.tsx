"use client";

import {
  AssistantGuidance,
  ReplyComposer,
} from "@tara/ui/components/assistant-guidance";
import { Button } from "@tara/ui/components/button";
import type { AssistantState } from "@tara/ui/lib/assistant";
import { MessageCircle } from "lucide-react";
import { useCallback, useState } from "react";

import type { PreviewProgress } from "./preview-progress";

interface PreviewGuidanceProps {
  readonly onViewSop: () => void;
  readonly progress: PreviewProgress;
  readonly source: string;
  readonly status: AssistantState;
}

export function PreviewGuidance({
  onViewSop,
  progress,
  source,
  status,
}: PreviewGuidanceProps) {
  const [consultation, setConsultation] = useState(false);
  const [question, setQuestion] = useState("");
  const onReply = useCallback((text: string) => setQuestion(text), []);
  const toggleConsultation = useCallback(
    () => setConsultation((value) => !value),
    []
  );
  const working = progress.phase === "working";

  return (
    <AssistantGuidance
      composer={
        <>
          <div className="tara-consultation-control">
            <Button
              disabled={!working}
              onClick={toggleConsultation}
              size="sm"
              variant="ghost"
            >
              <MessageCircle aria-hidden="true" />
              {consultation ? "Return to silent mode" : "Ask TARA"}
            </Button>
            <span>{consultation ? "Text preview" : "Silent mode"}</span>
          </div>
          <ReplyComposer
            disabled={!(consultation && working)}
            onSubmit={onReply}
            placeholder="Ask a question…"
            statusMessage={
              consultation
                ? "Preview only · AI and voice are not connected"
                : "Activate Ask TARA to type"
            }
          />
        </>
      }
      onViewSop={onViewSop}
      source={source}
      status={status}
    >
      {question ? (
        <div className="tara-chat-messages">
          <div className="tara-chat-message" data-speaker="user">
            <span>You</span>
            <p>{question}</p>
          </div>
          <p className="tara-chat-empty" role="status">
            This is a component preview. A connected session is needed for TARA
            to answer your question.
          </p>
        </div>
      ) : (
        <p className="tara-chat-empty">
          Your questions and TARA’s replies appear here.
        </p>
      )}
    </AssistantGuidance>
  );
}
