export interface ConsultationTurn {
  answer: string;
  question: string;
  status: "idle" | "sending" | "waiting" | "answered" | "unconfirmed";
}

export const emptyConsultationTurn: ConsultationTurn = {
  answer: "",
  question: "",
  status: "idle",
};

type ConsultationAction =
  | { type: "send"; text: string }
  | { type: "accepted"; text: string }
  | { type: "unconfirmed"; text: string }
  | { type: "transcript"; payload: Record<string, unknown> };

/** Keep the current question with its reply, without turning automatic alerts into chat. */
export function consultationTurn(
  previous: ConsultationTurn,
  action: ConsultationAction
): ConsultationTurn {
  if (action.type === "send") {
    return { answer: "", question: action.text, status: "sending" };
  }
  if (action.type === "accepted" || action.type === "unconfirmed") {
    if (previous.question !== action.text || previous.status !== "sending") {
      return previous;
    }
    return {
      ...previous,
      status: action.type === "accepted" ? "waiting" : "unconfirmed",
    };
  }
  const { mode, role, text } = action.payload;
  if (mode !== "consultation" || typeof text !== "string" || !text.trim()) {
    return previous;
  }
  if (role === "user") {
    if (previous.question === text && previous.status === "waiting") {
      return previous;
    }
    return { answer: "", question: text, status: "waiting" };
  }
  if (role === "assistant") {
    return { ...previous, answer: text, status: "answered" };
  }
  return previous;
}

export async function trackConsultationRequest(
  method: string,
  extra: Record<string, unknown>,
  request: () => Promise<Record<string, unknown>>,
  update: (action: ConsultationAction) => void
): Promise<Record<string, unknown>> {
  const text = typeof extra.text === "string" ? extra.text.trim() : "";
  if (method !== "assistant.text" || !text) {
    return await request();
  }
  update({ text, type: "send" });
  try {
    const result = await request();
    update({
      text,
      type: result.accepted === true ? "accepted" : "unconfirmed",
    });
    return result;
  } catch (cause) {
    update({ text, type: "unconfirmed" });
    throw cause;
  }
}
