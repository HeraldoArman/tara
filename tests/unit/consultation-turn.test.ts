import { expect, test } from "bun:test";
import {
  type ConsultationTurn,
  consultationTurn,
  emptyConsultationTurn,
  trackConsultationRequest,
} from "../../apps/web/src/lib/consultation-turn";

test("automatic alerts and unknown transcript modes never become chat", () => {
  const previous = {
    answer: "Use the approved puller.",
    question: "Which tool?",
    status: "answered",
  } as const;
  for (const payload of [
    { mode: "alert", role: "assistant", text: "Move your hands away." },
    { mode: "silent", role: "assistant", text: "Current step complete." },
    { role: "assistant", text: "Unclassified message" },
    { mode: "consultation", role: "system", text: "Internal instruction" },
    { mode: "consultation", role: "assistant", text: "  " },
  ]) {
    expect(consultationTurn(previous, { payload, type: "transcript" })).toBe(
      previous
    );
  }
});

test("a new typed question clears the old answer before a new reply arrives", () => {
  const previous = {
    answer: "Old reply",
    question: "Old question",
    status: "answered",
  } as const;
  const sending = consultationTurn(previous, {
    text: "Which tool?",
    type: "send",
  });
  expect(sending).toEqual({
    answer: "",
    question: "Which tool?",
    status: "sending",
  });
  const accepted = consultationTurn(sending, {
    text: "Which tool?",
    type: "accepted",
  });
  expect(accepted.status).toBe("waiting");
  const answered = consultationTurn(accepted, {
    payload: {
      mode: "consultation",
      role: "assistant",
      text: "Use the keycap puller.",
    },
    type: "transcript",
  });
  expect(answered).toEqual({
    answer: "Use the keycap puller.",
    question: "Which tool?",
    status: "answered",
  });
});

test("voice questions appear and reset the previous turn without a typed RPC", () => {
  const first = consultationTurn(emptyConsultationTurn, {
    payload: { mode: "consultation", role: "user", text: "Which tool?" },
    type: "transcript",
  });
  const answered = consultationTurn(first, {
    payload: {
      mode: "consultation",
      role: "assistant",
      text: "Use the keycap puller.",
    },
    type: "transcript",
  });
  const next = consultationTurn(answered, {
    payload: { mode: "consultation", role: "user", text: "How do I hold it?" },
    type: "transcript",
  });
  expect(next).toEqual({
    answer: "",
    question: "How do I hold it?",
    status: "waiting",
  });
  expect(
    consultationTurn(next, {
      payload: { mode: "consultation", role: "user", text: next.question },
      type: "transcript",
    })
  ).toBe(next);
});

test("late typed acknowledgements cannot erase a reply or replace a newer voice turn", () => {
  const sending = consultationTurn(emptyConsultationTurn, {
    text: "Which tool?",
    type: "send",
  });
  const answered = consultationTurn(sending, {
    payload: {
      mode: "consultation",
      role: "assistant",
      text: "Use the keycap puller.",
    },
    type: "transcript",
  });
  expect(
    consultationTurn(answered, { text: "Which tool?", type: "accepted" })
  ).toBe(answered);
  const voice = consultationTurn(sending, {
    payload: {
      mode: "consultation",
      role: "user",
      text: "Where is the label?",
    },
    type: "transcript",
  });
  expect(
    consultationTurn(voice, { text: "Which tool?", type: "unconfirmed" })
  ).toBe(voice);
});

test("unconfirmed submissions remain visibly distinct from an accepted question", () => {
  const sending = consultationTurn(emptyConsultationTurn, {
    text: "Which tool?",
    type: "send",
  });
  expect(
    consultationTurn(sending, { text: "Which tool?", type: "unconfirmed" })
  ).toEqual({ answer: "", question: "Which tool?", status: "unconfirmed" });
});

test("typed RPC replies arriving before acknowledgement are retained", async () => {
  let state: ConsultationTurn = emptyConsultationTurn;
  const result = await trackConsultationRequest(
    "assistant.text",
    { text: " Which tool? " },
    () => {
      expect(state).toEqual({
        answer: "",
        question: "Which tool?",
        status: "sending",
      });
      state = consultationTurn(state, {
        payload: {
          mode: "consultation",
          role: "assistant",
          text: "Use the puller.",
        },
        type: "transcript",
      });
      return Promise.resolve({ accepted: true });
    },
    (action) => {
      state = consultationTurn(state, action);
    }
  );
  expect(result.accepted).toBe(true);
  expect(state).toEqual({
    answer: "Use the puller.",
    question: "Which tool?",
    status: "answered",
  });
});

test("RPC failures mark the question unconfirmed without hiding the original error", async () => {
  let state: ConsultationTurn = emptyConsultationTurn;
  await expect(
    trackConsultationRequest(
      "assistant.text",
      { text: "Which tool?" },
      () => Promise.reject(new Error("Connection unavailable")),
      (action) => {
        state = consultationTurn(state, action);
      }
    )
  ).rejects.toThrow("Connection unavailable");
  expect(state).toEqual({
    answer: "",
    question: "Which tool?",
    status: "unconfirmed",
  });
});
