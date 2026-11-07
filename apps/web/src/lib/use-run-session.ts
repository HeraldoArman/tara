"use client";
import {
  createLocalVideoTrack,
  type LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "./api";
import type { Connection, Run } from "./contracts";
import { recoverWorkerContext } from "./worker-readiness";

export function useRunSession(initialRun: Run) {
  const [run, setRun] = useState(initialRun);
  const current = useRef(initialRun);
  const [connection, setConnection] = useState("disconnected");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [camera, setCamera] = useState(false);
  const [microphone, setMicrophone] = useState(false);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [checking, setChecking] = useState(false);
  const [presentation, setPresentation] = useState<Record<
    string,
    unknown
  > | null>(null);
  const room = useRef<Room | null>(null);
  const worker = useRef("");
  const cameraTrack = useRef<LocalVideoTrack | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const audioElements = useRef<HTMLMediaElement[]>([]);
  const muteRef = useRef(false);
  const apply = useCallback((snapshot: Run) => {
    if (
      snapshot.id === current.current.id &&
      snapshot.version >= current.current.version
    ) {
      current.current = snapshot;
      setRun(snapshot);
      setChecking(false);
    }
  }, []);
  const refresh = useCallback(async () => {
    const snapshot = await api<Run>(`/runs/${current.current.id}`);
    apply(snapshot);
    return snapshot;
  }, [apply]);
  const call = useCallback(
    async (method: string, extra: Record<string, unknown> = {}) => {
      const active = room.current;
      if (!active || connection !== "connected") {
        throw new Error("Reconnect to the assistant before changing the run.");
      }
      const latest = current.current;
      const response = await active.localParticipant.performRpc({
        destinationIdentity: worker.current,
        method,
        payload: JSON.stringify({
          expectedAttemptId: latest.currentAttemptId,
          expectedStepId: latest.currentStepId,
          expectedVersion: latest.version,
          idempotencyKey: crypto.randomUUID(),
          ...extra,
        }),
        responseTimeout: 15_000,
      });
      const result: unknown = JSON.parse(response);
      if (result && typeof result === "object") {
        const value = result as Record<string, unknown>;
        if (value.error) {
          const failure = value.error as { message?: string };
          throw new Error(
            failure.message ?? "The action could not be completed."
          );
        }
        const candidate = (value.snapshot ?? value.run ?? value) as Run;
        if (candidate.id && Array.isArray(candidate.steps)) {
          apply(candidate);
        } else {
          await refresh();
        }
        if (typeof value.text === "string") {
          setTranscript(value.text);
        }
      }
      return result;
    },
    [apply, connection, refresh]
  );
  const connect = useCallback(async () => {
    setConnection("connecting");
    setError("");
    try {
      await room.current?.disconnect();
      cameraTrack.current?.stop();
      cameraTrack.current?.detach();
      cameraTrack.current = null;
      setCamera(false);
      setMicrophone(false);
      const credentials = await api<Connection>(
        `/runs/${current.current.id}/connection`,
        { method: "POST" }
      );
      const nextRoom = new Room({ adaptiveStream: true, dynacast: true });
      worker.current = credentials.workerIdentity;
      room.current = nextRoom;
      nextRoom.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          element.muted = muteRef.current;
          audioElements.current.push(element);
          document.body.append(element);
          element
            .play()
            .catch(() =>
              setError(
                "Audio playback needs a browser gesture. Use the sound control to enable replies."
              )
            );
        }
      });
      nextRoom.on(
        RoomEvent.DataReceived,
        (bytes, participant, _kind, topic) => {
          if (
            participant?.identity !== worker.current ||
            topic !== "tara.events"
          ) {
            return;
          }
          receiveWorkerEvent(bytes, current.current.id, {
            checking: setChecking,
            error: setError,
            present: setPresentation,
            reload: () => {
              refresh().catch((e: unknown) => setError(errorMessage(e)));
            },
            silent: () => {
              setMicrophone(false);
              nextRoom.localParticipant
                .setMicrophoneEnabled(false)
                .catch(() =>
                  setError(
                    "Turn off microphone access in your browser while reconnecting."
                  )
                );
              apply({ ...current.current, interactionMode: "silent" });
            },
            snapshot: (payload) => {
              const snapshot = (payload.snapshot ??
                payload.run ??
                payload) as unknown as Run;
              if (snapshot.id && Array.isArray(snapshot.steps)) {
                apply(snapshot);
              } else {
                refresh().catch((e: unknown) => setError(errorMessage(e)));
              }
            },
            transcript: setTranscript,
          });
        }
      );
      nextRoom.on(RoomEvent.Reconnecting, () => {
        setConnection("reconnecting");
        setMicrophone(false);
        nextRoom.localParticipant.setMicrophoneEnabled(false).catch(() => {
          setError(
            "Turn off microphone access in your browser while reconnecting."
          );
        });
      });
      nextRoom.on(RoomEvent.Reconnected, () => {
        const restoreSilentSession = async () => {
          try {
            const fresh = await api<Connection>(
              `/runs/${current.current.id}/connection`,
              { method: "POST" }
            );
            if (fresh.workerIdentity !== worker.current) {
              throw new Error(
                "The assistant session changed. Reconnect before continuing."
              );
            }
            const response = await nextRoom.localParticipant.performRpc({
              destinationIdentity: fresh.workerIdentity,
              method: "assistant.deactivate",
              payload: "{}",
              responseTimeout: 15_000,
            });
            const result = JSON.parse(response) as {
              error?: { message: string };
            };
            if (result.error) {
              throw new Error(result.error.message);
            }
            await refresh();
            setConnection("connected");
          } catch (e) {
            setError(errorMessage(e));
            await nextRoom.disconnect();
            setConnection("disconnected");
          }
        };
        restoreSilentSession().catch((e: unknown) => setError(errorMessage(e)));
      });
      nextRoom.on(RoomEvent.Disconnected, () => {
        setConnection("disconnected");
        setMicrophone(false);
        setCamera(false);
      });
      await nextRoom.connect(credentials.url, credentials.token);
      apply(
        await waitForWorkerReady(nextRoom, credentials.workerIdentity, refresh)
      );
      setConnection("connected");
      await refresh();
    } catch (e) {
      setConnection("disconnected");
      setError(errorMessage(e));
    }
  }, [apply, refresh]);
  const toggleCamera = useCallback(async () => {
    setError("");
    try {
      if (cameraTrack.current) {
        await room.current?.localParticipant.unpublishTrack(
          cameraTrack.current
        );
        cameraTrack.current.stop();
        cameraTrack.current.detach();
        cameraTrack.current = null;
        setCamera(false);
        return;
      }
      if (!room.current || connection !== "connected") {
        throw new Error(
          "Connect the assistant before enabling the bench camera."
        );
      }
      const track = await createLocalVideoTrack({
        facingMode: "environment",
        resolution: { frameRate: 15, height: 720, width: 1280 },
      });
      cameraTrack.current = track;
      if (video.current) {
        track.attach(video.current);
      }
      await room.current.localParticipant.publishTrack(track, {
        source: Track.Source.Camera,
      });
      setCamera(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [connection]);
  const action = useCallback(
    async (method: string, extra: Record<string, unknown> = {}) => {
      setBusy(method);
      setError("");
      try {
        return await call(method, extra);
      } catch (e) {
        setError(errorMessage(e));
        await refresh().catch(() => setConnection("disconnected"));
        return null;
      } finally {
        setBusy("");
      }
    },
    [call, refresh]
  );
  const consultation = useCallback(async () => {
    if (current.current.interactionMode === "consultation") {
      setMicrophone(false);
      try {
        await room.current?.localParticipant.setMicrophoneEnabled(false);
      } catch {
        await room.current?.disconnect();
        setConnection("disconnected");
        setError(
          "The microphone session was closed. Reconnect to resume silently."
        );
        return;
      }
      const result = await action("assistant.deactivate");
      if (!result) {
        await room.current?.disconnect();
        setConnection("disconnected");
      }
      return;
    }
    const result = await action("assistant.activate");
    if (result) {
      try {
        await room.current?.localParticipant.setMicrophoneEnabled(true);
        setMicrophone(true);
      } catch {
        setError(
          "Microphone access was unavailable. You can still type your question below."
        );
      }
    }
  }, [action]);
  const toggleMute = useCallback(async () => {
    const next = !muteRef.current;
    muteRef.current = next;
    setMuted(next);
    for (const element of audioElements.current) {
      element.muted = next;
      if (!next) {
        element
          .play()
          .catch(() => setError("Enable audio playback in your browser."));
      }
    }
    await action("assistant.mute", { muted: next });
  }, [action]);
  useEffect(
    () => () => {
      cameraTrack.current?.stop();
      for (const element of audioElements.current) {
        element.remove();
      }
      room.current?.disconnect();
    },
    []
  );
  return {
    action,
    busy,
    camera,
    checking,
    connect,
    connection,
    consultation,
    error,
    microphone,
    muted,
    presentation,
    refresh,
    run,
    toggleCamera,
    toggleMute,
    transcript,
    video,
  };
}

interface WorkerEventHandlers {
  checking: (active: boolean) => void;
  error: (message: string) => void;
  present: (payload: Record<string, unknown>) => void;
  reload: () => void;
  silent: () => void;
  snapshot: (payload: Record<string, unknown>) => void;
  transcript: (text: string) => void;
}
function receiveWorkerEvent(
  bytes: Uint8Array,
  runId: string,
  handlers: WorkerEventHandlers
) {
  try {
    const envelope = JSON.parse(new TextDecoder().decode(bytes)) as {
      runId?: string;
      type: string;
      payload: Record<string, unknown>;
    };
    if (envelope.runId && envelope.runId !== runId) {
      return;
    }
    const { payload, type } = envelope;
    switch (type) {
      case "ui.present":
        handlers.present(payload);
        return;
      case "run.snapshot":
      case "run.updated":
        handlers.snapshot(payload);
        return;
      case "agent.state":
        if (payload.mode === "silent") {
          handlers.silent();
        }
        return;
      case "agent.transcript":
        if (payload.role !== "user" && typeof payload.text === "string") {
          handlers.transcript(payload.text);
        }
        return;
      case "attempt.updated":
        if (payload.status === "scanning") {
          handlers.checking(true);
        } else {
          handlers.reload();
        }
        return;
      case "alert.created":
        handlers.reload();
        return;
      default:
        return;
    }
  } catch {
    handlers.error(
      "The session sent an unreadable update. Refresh the run before continuing."
    );
  }
}
async function waitForWorkerReady(
  room: Room,
  identity: string,
  loadSnapshot: () => Promise<Run>
): Promise<Run> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (room.remoteParticipants.has(identity)) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: Startup probes must be sequential to avoid a burst of RPC requests before worker registration.
        const response = await room.localParticipant.performRpc({
          destinationIdentity: identity,
          method: "run.get_context",
          payload: "{}",
          responseTimeout: 2000,
        });
        const snapshot = await recoverWorkerContext(
          JSON.parse(response),
          loadSnapshot
        );
        if (snapshot) {
          return snapshot;
        }
      } catch {
        /* Worker registration or model startup is still pending. */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  await room.disconnect();
  throw new Error(
    "The assistant is still starting. Reconnect in a moment; the procedure has not changed."
  );
}
