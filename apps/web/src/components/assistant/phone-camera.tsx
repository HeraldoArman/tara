"use client";

import "./phone-camera.css";

import {
  ConnectionState,
  createLocalVideoTrack,
  type LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import {
  Camera,
  CameraOff,
  RefreshCw,
  RotateCw,
  Smartphone,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { usePhoneLandscape } from "@/lib/use-phone-landscape";

interface CameraCapability {
  id: string;
  token: string;
}
interface PhoneConnection {
  expiresAt: string;
  participantIdentity: string;
  roomName: string;
  token: string;
  url: string;
}
type PhoneStatus = "ready" | "connecting" | "live" | "reconnecting" | "stopped";
const PAIRING_ID = /^[a-zA-Z0-9_-]{1,100}$/;
const PAIRING_TOKEN = /^[a-zA-Z0-9_-]{16,512}$/;

function readCapability(): CameraCapability | null {
  const parts = window.location.hash.slice(1).split(":");
  if (parts.length !== 2) {
    return null;
  }
  try {
    const id = decodeURIComponent(parts[0]);
    const token = decodeURIComponent(parts[1]);
    if (!(PAIRING_ID.test(id) && PAIRING_TOKEN.test(token))) {
      return null;
    }
    return { id, token };
  } catch {
    return null;
  }
}

function usePhoneConnection() {
  const [capability, setCapability] = useState<CameraCapability | null>(null);
  const [status, setStatus] = useState<PhoneStatus>("ready");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [background, setBackground] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const room = useRef<Room | null>(null);
  const track = useRef<LocalVideoTrack | null>(null);
  const facing = useRef<"environment" | "user">("environment");
  const generation = useRef(0);
  const working = useRef<boolean>(false);
  const mounted = useRef<boolean>(true);

  const release = useCallback(async () => {
    const previousTrack = track.current;
    const previousRoom = room.current;
    track.current = null;
    room.current = null;
    previousTrack?.stop();
    previousTrack?.detach();
    previousRoom?.removeAllListeners();
    if (previousRoom) {
      await previousRoom.disconnect().catch(() => undefined);
    }
  }, []);
  const stop = useCallback(async () => {
    generation.current += 1;
    await release();
    if (mounted.current) {
      setStream(null);
      setStatus("stopped");
      setBusy(false);
    }
  }, [release]);

  useEffect(() => {
    mounted.current = true;
    const value = readCapability();
    setCapability(value);
    if (!value) {
      setError(
        "Open the phone-camera link by scanning the QR code on your laptop."
      );
    }
    return () => {
      mounted.current = false;
      generation.current += 1;
      release().catch(() => undefined);
    };
  }, [release]);

  const start = useCallback(async () => {
    if (!capability || working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    setError("");
    setStatus("connecting");
    generation.current += 1;
    const { current } = generation;
    const owns = () => mounted.current && generation.current === current;
    try {
      await release();
      const credentials = await api<PhoneConnection>(
        `/camera-pairings/${encodeURIComponent(capability.id)}/connection`,
        { body: JSON.stringify({ token: capability.token }), method: "POST" }
      );
      if (!owns()) {
        return;
      }
      const active = new Room({ adaptiveStream: false, dynacast: true });
      room.current = active;
      active.on(RoomEvent.Reconnecting, () => {
        if (owns()) {
          setStatus("reconnecting");
        }
      });
      active.on(RoomEvent.Reconnected, () => {
        if (owns()) {
          setStatus("live");
        }
      });
      active.on(RoomEvent.Disconnected, () => {
        if (owns()) {
          setError(
            "The camera disconnected. Start it again, or scan a new QR code if the laptop ended pairing."
          );
          stop().catch(() => undefined);
        }
      });
      await active.connect(credentials.url, credentials.token, {
        autoSubscribe: false,
      });
      if (!owns()) {
        await active.disconnect();
        return;
      }
      const camera = await createLocalVideoTrack({
        facingMode: facing.current,
        resolution: {
          aspectRatio: 16 / 9,
          frameRate: 15,
          height: 720,
          width: 1280,
        },
      });
      if (!owns()) {
        camera.stop();
        return;
      }
      track.current = camera;
      await active.localParticipant.publishTrack(camera, {
        source: Track.Source.Camera,
      });
      if (!owns()) {
        camera.stop();
        return;
      }
      setStream(new MediaStream([camera.mediaStreamTrack]));
      setStatus("live");
    } catch (cause) {
      if (owns()) {
        setError(errorMessage(cause));
        await release();
        setStream(null);
        setStatus("stopped");
      }
    } finally {
      working.current = false;
      if (owns()) {
        setBusy(false);
      }
    }
  }, [capability, release, stop]);

  const flip = useCallback(async () => {
    const camera = track.current;
    if (!camera || working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    setError("");
    const { current } = generation;
    try {
      const next = facing.current === "environment" ? "user" : "environment";
      await camera.restartTrack({
        facingMode: next,
        resolution: {
          aspectRatio: 16 / 9,
          frameRate: 15,
          height: 720,
          width: 1280,
        },
      });
      if (mounted.current && generation.current === current) {
        facing.current = next;
        setStream(new MediaStream([camera.mediaStreamTrack]));
      } else {
        camera.stop();
      }
    } catch {
      if (mounted.current && generation.current === current) {
        setError(
          "This camera could not switch. Stop the stream and try starting again."
        );
      }
    } finally {
      working.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    const media = stream?.getVideoTracks()[0];
    if (!media) {
      return;
    }
    const ended = () => {
      if (!working.current) {
        setError("The camera stopped. Tap Start phone camera to reconnect.");
        stop().catch(() => undefined);
      }
    };
    media.addEventListener("ended", ended);
    return () => media.removeEventListener("ended", ended);
  }, [stream, stop]);

  useEffect(() => {
    const changeVisibility = () => {
      setBackground(document.visibilityState === "hidden");
      if (
        document.visibilityState === "visible" &&
        track.current &&
        (track.current.mediaStreamTrack.readyState !== "live" ||
          room.current?.state !== ConnectionState.Connected)
      ) {
        setError(
          "Your phone paused the camera in the background. Start it again to continue."
        );
        stop().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", changeVisibility);
    return () =>
      document.removeEventListener("visibilitychange", changeVisibility);
  }, [stop]);

  useEffect(() => {
    if (!(capability && (status === "live" || status === "reconnecting"))) {
      return;
    }
    let cancelled = false;
    let pending = false;
    const check = async () => {
      if (pending) {
        return;
      }
      pending = true;
      try {
        const result = await api<{ active: boolean }>(
          `/camera-pairings/${encodeURIComponent(capability.id)}/status`,
          { body: JSON.stringify({ token: capability.token }), method: "POST" }
        );
        if (!(cancelled || result.active)) {
          setError(
            "This phone pairing has ended. Scan a new QR code on the laptop to reconnect."
          );
          await stop();
        }
      } catch {
        if (!cancelled) {
          setError(
            "The camera connection could not be confirmed. Start it again when your connection returns."
          );
          await stop();
        }
      } finally {
        pending = false;
      }
    };
    const timer = window.setInterval(check, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [capability, status, stop]);

  return {
    background,
    busy,
    error,
    flip,
    paired: Boolean(capability),
    start,
    status,
    stop,
    stream,
  };
}

export function PhoneCamera() {
  const camera = usePhoneConnection();
  const { enterLandscape, portrait } = usePhoneLandscape();
  const startLandscapeCamera = useCallback(async () => {
    if (await enterLandscape()) {
      await camera.start();
    }
  }, [camera.start, enterLandscape]);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (element) {
      element.srcObject = camera.stream;
    }
    return () => {
      if (element) {
        element.srcObject = null;
      }
    };
  }, [camera.stream]);
  const live = camera.status === "live" || camera.status === "reconnecting";
  return (
    <main className="tara-phone-camera">
      <video
        aria-label="Phone camera preview"
        autoPlay
        muted
        playsInline
        ref={video}
      />
      <header className="tara-phone-header">
        <span className="tara-phone-brand">tara.</span>
        <span className="tara-phone-status" data-live={live} role="status">
          {camera.status === "live" ? "Camera connected" : camera.status}
        </span>
      </header>
      {!live && portrait ? (
        <section className="tara-phone-orientation" role="status">
          <Smartphone aria-hidden="true" />
          <h1>Turn your phone sideways.</h1>
          <p>
            Use the camera horizontally for a wider view of your work area. Turn
            off your phone’s rotation lock if the view stays vertical.
          </p>
        </section>
      ) : null}
      {live || portrait ? null : (
        <section className="tara-phone-intro">
          <Camera aria-hidden="true" />
          <h1>Your phone. Your work area.</h1>
          <p>
            Share this camera with your laptop session. Keep the laptop open for
            TARA’s voice and work instructions.
          </p>
        </section>
      )}
      <section
        aria-label="Phone camera controls"
        className="tara-phone-controls"
      >
        <p>Camera only · no microphone or assistant audio on this phone</p>
        {camera.background ? (
          <p>
            Keep this page open. Your phone may pause video while it is locked.
          </p>
        ) : null}
        {camera.error ? (
          <p className="tara-phone-error" role="alert">
            {camera.error}
          </p>
        ) : null}
        <div>
          {live ? (
            <>
              <button
                disabled={camera.busy}
                onClick={camera.flip}
                type="button"
              >
                <RotateCw aria-hidden="true" />
                Flip camera
              </button>
              <button onClick={camera.stop} type="button">
                <CameraOff aria-hidden="true" />
                Stop camera
              </button>
            </>
          ) : (
            <button
              disabled={!camera.paired || camera.busy}
              onClick={startLandscapeCamera}
              type="button"
            >
              {camera.busy ? (
                <RefreshCw aria-hidden="true" className="tara-phone-spin" />
              ) : (
                <Camera aria-hidden="true" />
              )}
              {camera.busy ? "Connecting…" : "Start phone camera"}
            </button>
          )}
        </div>
        <small>
          Return to this page if video pauses in the background. End pairing
          from your laptop when you finish.
        </small>
      </section>
    </main>
  );
}
