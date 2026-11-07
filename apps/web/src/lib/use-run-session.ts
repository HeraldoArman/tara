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
import { publishCameraTrack } from "./publish-camera";
import { recoverWorkerContext } from "./worker-readiness";

export function useRunSession(initialRun: Run) {
  const [run, setRun] = useState(initialRun);
  const current = useRef(initialRun);
  const [connection, setConnection] = useState("disconnected");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [camera, setCamera] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [microphone, setMicrophone] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
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
  const audioBlockedRef = useRef<boolean>(false);
  const mounted = useRef<boolean>(true);
  const connectionRef = useRef("disconnected");
  const connectionGeneration = useRef(0);
  const cameraGeneration = useRef(0);
  const connecting = useRef<Promise<Room | null> | null>(null);
  const startingCamera = useRef<Promise<boolean> | null>(null);
  const activeAction = useRef<symbol | null>(null);
  const updateAudioBlocked = useCallback((blocked: boolean) => {
    audioBlockedRef.current = blocked;
    if (mounted.current) {
      setAudioBlocked(blocked);
    }
  }, []);
  const unlockAudio = useCallback(async (): Promise<void> => {
    const active = room.current;
    if (!active || muteRef.current) {
      return;
    }
    try {
      // Start synchronously within the click/submit gesture, before any RPC awaits.
      await active.startAudio();
      if (room.current === active) {
        updateAudioBlocked(false);
      }
    } catch {
      if (mounted.current && room.current === active) {
        updateAudioBlocked(true);
        setError(
          "Audio playback is blocked. Select Enable assistant audio to hear replies."
        );
      }
    } finally {
      // LiveKit startAudio unmutes attached elements; preserve a newer mute choice.
      if (room.current === active) {
        for (const element of audioElements.current) {
          element.muted = muteRef.current;
        }
      }
    }
  }, [updateAudioBlocked]);
  const updateConnection = useCallback((value: string) => {
    connectionRef.current = value;
    if (mounted.current) {
      setConnection(value);
    }
  }, []);
  const stopCamera = useCallback(async () => {
    cameraGeneration.current += 1;
    const track = cameraTrack.current;
    cameraTrack.current = null;
    if (mounted.current) {
      setCamera(false);
      setCameraStream(null);
    }
    if (track) {
      track.stop();
      track.detach();
      await room.current?.localParticipant
        .unpublishTrack(track)
        .catch(() => undefined);
    }
  }, []);
  const releaseRoom = useCallback(
    async (target: Room | null) => {
      if (room.current === target) {
        // Clear identity first so late SDK events cannot change a replacement session.
        room.current = null;
        worker.current = "";
        const stopped = stopCamera();
        for (const element of audioElements.current) {
          element.pause();
          element.srcObject = null;
          element.remove();
        }
        audioElements.current = [];
        updateAudioBlocked(false);
        updateConnection("disconnected");
        if (mounted.current) {
          setMicrophone(false);
          setChecking(false);
        }
        target?.localParticipant
          .getTrackPublication(Track.Source.Microphone)
          ?.track?.stop();
        await stopped;
      }
      if (target) {
        target.removeAllListeners();
        await target.disconnect().catch(() => undefined);
      }
    },
    [stopCamera, updateAudioBlocked, updateConnection]
  );
  const apply = useCallback(
    (snapshot: Run) => {
      if (
        mounted.current &&
        snapshot.id === current.current.id &&
        snapshot.version >= current.current.version
      ) {
        current.current = snapshot;
        setRun(snapshot);
        setChecking(false);
        const active = room.current;
        if (active && snapshot.interactionMode !== "consultation") {
          setMicrophone(false);
          stopPublishedMicrophone(active).catch(() => releaseRoom(active));
        }
        if (active && !["active", "paused"].includes(snapshot.status)) {
          stopCamera().catch(() => undefined);
          for (const element of audioElements.current) {
            element.muted = true;
            element.pause();
          }
          if (!activeAction.current) {
            releaseRoom(active).catch(() => undefined);
          }
        }
      }
    },
    [releaseRoom, stopCamera]
  );
  const refresh = useCallback(async () => {
    const snapshot = await api<Run>(`/runs/${current.current.id}`);
    apply(snapshot);
    return snapshot;
  }, [apply]);
  const call = useCallback(
    async (method: string, extra: Record<string, unknown> = {}) => {
      const active = room.current;
      if (!active || connectionRef.current !== "connected") {
        throw new Error("Reconnect to the assistant before changing the run.");
      }
      if (method === "assistant.text") {
        await unlockAudio();
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
      if (!mounted.current || room.current !== active) {
        throw new Error(
          "The assistant session changed. Reconnect before continuing."
        );
      }
      const value = parseWorkerResponse(response);
      const candidate = (value.snapshot ?? value.run ?? value) as Run;
      if (candidate.id && Array.isArray(candidate.steps)) {
        apply(candidate);
      } else {
        await refresh();
      }
      if (typeof value.text === "string") {
        setTranscript(value.text);
      }
      return value;
    },
    [apply, refresh, unlockAudio]
  );
  const connect = useCallback((): Promise<Room | null> => {
    if (!mounted.current) {
      return Promise.resolve(null);
    }
    if (connecting.current) {
      return connecting.current;
    }
    if (room.current && connectionRef.current === "connected") {
      return Promise.resolve(room.current);
    }
    connectionGeneration.current += 1;
    const generation = connectionGeneration.current;
    const isCurrent = () =>
      mounted.current && connectionGeneration.current === generation;
    const establish = async (): Promise<Room | null> => {
      await releaseRoom(room.current);
      if (!isCurrent()) {
        return null;
      }
      updateConnection("connecting");
      setError("");
      let nextRoom: Room | null = null;
      try {
        const credentials = await api<Connection>(
          `/runs/${current.current.id}/connection`,
          { method: "POST" }
        );
        if (!isCurrent()) {
          return null;
        }
        const active = new Room({ adaptiveStream: true, dynacast: true });
        nextRoom = active;
        worker.current = credentials.workerIdentity;
        room.current = active;
        const ownsRoom = () => isCurrent() && room.current === active;
        const reload = async () => {
          const snapshot = await api<Run>(`/runs/${current.current.id}`);
          if (ownsRoom()) {
            apply(snapshot);
          }
          return snapshot;
        };
        const showRoomError = (cause: unknown) => {
          if (ownsRoom()) {
            setError(errorMessage(cause));
          }
        };
        active.on(RoomEvent.AudioPlaybackStatusChanged, (playing) => {
          if (ownsRoom()) {
            updateAudioBlocked(!playing);
          }
        });
        active.on(
          RoomEvent.TrackSubscribed,
          (track, _publication, participant) => {
            if (
              ownsRoom() &&
              participant.identity === credentials.workerIdentity &&
              track.kind === Track.Kind.Audio
            ) {
              const element = track.attach();
              element.muted = muteRef.current;
              audioElements.current.push(element);
              document.body.append(element);
              element.play().catch(() => {
                if (ownsRoom()) {
                  updateAudioBlocked(true);
                  setError(
                    "Audio playback is blocked. Select Enable assistant audio to hear replies."
                  );
                }
              });
            }
          }
        );
        active.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (!ownsRoom() || track.kind !== Track.Kind.Audio) {
            return;
          }
          const detached = track.detach();
          for (const element of detached) {
            element.remove();
          }
          audioElements.current = audioElements.current.filter(
            (element) => !detached.includes(element)
          );
        });
        active.on(
          RoomEvent.DataReceived,
          (bytes, participant, _kind, topic) => {
            if (
              !ownsRoom() ||
              participant?.identity !== credentials.workerIdentity ||
              topic !== "tara.events"
            ) {
              return;
            }
            receiveWorkerEvent(bytes, current.current.id, {
              checking: setChecking,
              error: setError,
              fatal: () => {
                releaseRoom(active).catch(showRoomError);
              },
              present: setPresentation,
              reload: () => {
                reload().catch(showRoomError);
              },
              snapshot: (payload) => {
                const snapshot = (payload.snapshot ??
                  payload.run ??
                  payload) as unknown as Run;
                if (snapshot.id && Array.isArray(snapshot.steps)) {
                  apply(snapshot);
                } else {
                  reload().catch(showRoomError);
                }
              },
              transcript: setTranscript,
            });
          }
        );
        active.on(RoomEvent.Reconnecting, () => {
          if (!ownsRoom()) {
            return;
          }
          updateConnection("reconnecting");
          stopCamera().catch(showRoomError);
          setMicrophone(false);
          apply({ ...current.current, interactionMode: "silent" });
          active.localParticipant.setMicrophoneEnabled(false).catch(() => {
            if (ownsRoom()) {
              setError(
                "Turn off microphone access in your browser while reconnecting."
              );
            }
          });
        });
        active.on(RoomEvent.Reconnected, () => {
          if (!ownsRoom()) {
            return;
          }
          restoreSilentConnection(
            active,
            credentials.workerIdentity,
            current.current.id,
            reload,
            ownsRoom
          )
            .then((restored) => {
              if (restored) {
                updateConnection("connected");
              }
            })
            .catch(async (cause: unknown) => {
              if (ownsRoom()) {
                setError(errorMessage(cause));
                await releaseRoom(active);
              }
            });
        });
        active.on(RoomEvent.Disconnected, () => {
          if (ownsRoom()) {
            releaseRoom(active).catch(showRoomError);
          }
        });
        await active.connect(credentials.url, credentials.token);
        if (!ownsRoom()) {
          await releaseRoom(active);
          return null;
        }
        const snapshot = await waitForWorkerReady(
          active,
          credentials.workerIdentity,
          reload,
          ownsRoom
        );
        if (!ownsRoom()) {
          return null;
        }
        apply(snapshot);
        updateConnection("connected");
        return active;
      } catch (e) {
        if (isCurrent()) {
          setError(errorMessage(e));
        }
        await releaseRoom(nextRoom);
        return null;
      }
    };
    const pending = establish().finally(() => {
      if (connecting.current === pending) {
        connecting.current = null;
      }
    });
    connecting.current = pending;
    return pending;
  }, [apply, releaseRoom, stopCamera, updateAudioBlocked, updateConnection]);
  const startCamera = useCallback((): Promise<boolean> => {
    if (startingCamera.current) {
      return startingCamera.current.then(() => cameraTrack.current !== null);
    }
    if (cameraTrack.current && connectionRef.current === "connected") {
      return Promise.resolve(true);
    }
    if (!mounted.current) {
      return Promise.resolve(false);
    }
    setCameraBusy(true);
    setError("");
    const publish = async () => {
      const active = await connect();
      if (!active || room.current !== active || !mounted.current) {
        return false;
      }
      const generation = cameraGeneration.current;
      const isCurrent = () =>
        mounted.current &&
        room.current === active &&
        cameraGeneration.current === generation &&
        connectionRef.current === "connected";
      try {
        const track: LocalVideoTrack | null = await publishCameraTrack({
          create: () =>
            createLocalVideoTrack({
              facingMode: "environment",
              resolution: { frameRate: 15, height: 720, width: 1280 },
            }),
          isCurrent,
          publish: (candidate) =>
            active.localParticipant.publishTrack(candidate, {
              source: Track.Source.Camera,
            }),
          unpublish: (candidate) =>
            active.localParticipant.unpublishTrack(candidate),
        });
        if (!track) {
          return false;
        }
        cameraTrack.current = track;
        if (video.current) {
          track.attach(video.current);
        }
        setCameraStream(new MediaStream([track.mediaStreamTrack]));
        setCamera(true);
        return true;
      } catch (e) {
        if (isCurrent()) {
          setError(errorMessage(e));
        }
        return false;
      }
    };
    const pending = publish().finally(() => {
      if (startingCamera.current === pending) {
        startingCamera.current = null;
        if (mounted.current) {
          setCameraBusy(false);
        }
      }
    });
    startingCamera.current = pending;
    return pending;
  }, [connect]);
  const toggleCamera = useCallback(async () => {
    if (startingCamera.current) {
      return await startingCamera.current;
    }
    if (!cameraTrack.current) {
      return await startCamera();
    }
    setCameraBusy(true);
    const pending = stopCamera()
      .then(() => true)
      .finally(() => {
        if (startingCamera.current === pending) {
          startingCamera.current = null;
          if (mounted.current) {
            setCameraBusy(false);
          }
        }
      });
    startingCamera.current = pending;
    return await pending;
  }, [startCamera, stopCamera]);
  const action = useCallback(
    async (method: string, extra: Record<string, unknown> = {}) => {
      const ownsBusy = activeAction.current === null;
      if (
        !ownsBusy &&
        method !== "assistant.deactivate" &&
        method !== "assistant.mute"
      ) {
        setError("Wait for the current action to finish.");
        return null;
      }
      const token = Symbol(method);
      const actionRoom = room.current;
      if (ownsBusy) {
        activeAction.current = token;
        setBusy(method);
      }
      setError("");
      try {
        return await call(method, extra);
      } catch (e) {
        if (mounted.current && room.current === actionRoom) {
          setError(errorMessage(e));
          await refresh().catch(() => releaseRoom(actionRoom));
        }
        return null;
      } finally {
        if (activeAction.current === token) {
          activeAction.current = null;
          if (mounted.current) {
            setBusy("");
          }
          if (!["active", "paused"].includes(current.current.status)) {
            await releaseRoom(room.current);
          }
        }
      }
    },
    [call, refresh, releaseRoom]
  );
  const deactivateConsultation = useCallback(
    async (active: Room) => {
      setMicrophone(false);
      try {
        await stopPublishedMicrophone(active);
      } catch {
        await releaseRoom(active);
        setError(
          "The microphone session was closed. Reconnect to resume silently."
        );
        return;
      }
      const result = await action("assistant.deactivate");
      if (!result) {
        await releaseRoom(active);
      }
    },
    [action, releaseRoom]
  );
  const consultation = useCallback(async () => {
    const active = room.current;
    if (!active || connectionRef.current !== "connected") {
      setError("Connect the assistant before activating Ask TARA.");
      return;
    }
    if (current.current.interactionMode === "consultation") {
      await deactivateConsultation(active);
      return;
    }
    await unlockAudio();
    const result = await action("assistant.activate");
    const canListen = () =>
      mounted.current &&
      room.current === active &&
      current.current.interactionMode === "consultation";
    if (result && canListen()) {
      try {
        await active.localParticipant.setMicrophoneEnabled(true);
        if (canListen()) {
          setMicrophone(true);
        } else {
          await stopPublishedMicrophone(active);
        }
      } catch {
        if (mounted.current && room.current === active) {
          setError(
            "Microphone access was unavailable. You can still type your question below."
          );
        }
      }
    }
  }, [action, deactivateConsultation, unlockAudio]);
  const toggleMute = useCallback(async () => {
    const next = audioBlockedRef.current ? false : !muteRef.current;
    muteRef.current = next;
    setMuted(next);
    for (const element of audioElements.current) {
      element.muted = next;
    }
    const playback = next ? null : unlockAudio();
    await action("assistant.mute", { muted: next });
    if (playback) {
      await playback;
    }
  }, [action, unlockAudio]);
  useEffect(() => {
    apply(initialRun);
  }, [apply, initialRun]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      connectionGeneration.current += 1;
      connecting.current = null;
      startingCamera.current = null;
      activeAction.current = null;
      releaseRoom(room.current).catch(() => undefined);
    };
  }, [releaseRoom]);
  return {
    action,
    audioBlocked,
    busy,
    camera,
    cameraBusy,
    cameraStream,
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
    startCamera,
    stopCamera,
    toggleCamera,
    toggleMute,
    transcript,
    video,
  };
}

async function stopPublishedMicrophone(active: Room): Promise<void> {
  const track = active.localParticipant.getTrackPublication(
    Track.Source.Microphone
  )?.track;
  if (track) {
    track.stop();
    await active.localParticipant.setMicrophoneEnabled(false);
  }
}

function parseWorkerResponse(response: string): Record<string, unknown> {
  const value: unknown = JSON.parse(response);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "The assistant sent an unreadable action result. Refresh and try again."
    );
  }
  const result = value as Record<string, unknown>;
  if (result.error) {
    const failure = result.error as { message?: string };
    throw new Error(failure.message ?? "The action could not be completed.");
  }
  return result;
}

async function restoreSilentConnection(
  active: Room,
  workerIdentity: string,
  runId: string,
  loadSnapshot: () => Promise<Run>,
  isCurrent: () => boolean
): Promise<boolean> {
  const fresh = await api<Connection>(`/runs/${runId}/connection`, {
    method: "POST",
  });
  if (!isCurrent()) {
    return false;
  }
  if (fresh.workerIdentity !== workerIdentity) {
    throw new Error(
      "The assistant session changed. Reconnect before continuing."
    );
  }
  const response = await active.localParticipant.performRpc({
    destinationIdentity: workerIdentity,
    method: "assistant.deactivate",
    payload: "{}",
    responseTimeout: 15_000,
  });
  if (!isCurrent()) {
    return false;
  }
  parseWorkerResponse(response);
  await loadSnapshot();
  return isCurrent();
}

interface WorkerEventHandlers {
  checking: (active: boolean) => void;
  error: (message: string) => void;
  fatal: () => void;
  present: (payload: Record<string, unknown>) => void;
  reload: () => void;
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
          // State events have no run version. Reload instead of overwriting a newer activation.
          handlers.reload();
        }
        return;
      case "agent.error":
        handlers.error(
          typeof payload.message === "string"
            ? payload.message
            : "The assistant could not respond. Try again or reconnect."
        );
        if (payload.recoverable === false || payload.ready === false) {
          handlers.fatal();
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
  loadSnapshot: () => Promise<Run>,
  isCurrent: () => boolean
): Promise<Run> {
  const deadline = Date.now() + 20_000;
  while (isCurrent() && Date.now() < deadline) {
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
        if (snapshot && isCurrent()) {
          return snapshot;
        }
      } catch {
        /* Worker registration or model startup is still pending. */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(
    "The assistant is still starting. Reconnect in a moment; the procedure has not changed."
  );
}
