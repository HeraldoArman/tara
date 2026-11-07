"use client";

import type { CameraSource } from "@tara/ui/lib/assistant";
import { useCallback, useEffect, useRef, useState } from "react";

const stopStream = (stream: MediaStream | null) => {
  for (const track of stream?.getTracks() ?? []) {
    track.onended = null;
    track.stop();
  }
};

const cameraErrorMessage = (error: unknown): string => {
  if (!(error instanceof DOMException)) {
    return "The camera could not start. You can continue with the simulated feed.";
  }

  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "Camera access was not allowed. Allow it in your browser to try again, or continue with the simulated feed.";
  }

  if (error.name === "NotFoundError") {
    return "No camera was found. Connect a camera or continue with the simulated feed.";
  }

  if (error.name === "NotReadableError") {
    return "The camera is busy or unavailable. Close other apps using it and try again.";
  }

  return "The camera could not start. You can continue with the simulated feed.";
};

/** Local preview only: this hook does not record, upload, or analyze frames. */
export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);
  const pendingRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      pendingRef.current = false;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const stopCamera = useCallback(() => {
    requestRef.current += 1;
    pendingRef.current = false;
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setIsPending(false);
    setError(null);
  }, []);

  const startCamera = useCallback(async () => {
    if (pendingRef.current || streamRef.current) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Camera preview needs HTTPS or localhost and a supported browser. The simulated feed is still available."
      );
      return;
    }

    requestRef.current += 1;
    const request = requestRef.current;
    pendingRef.current = true;
    setIsPending(true);
    setError(null);

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "environment",
          height: { ideal: 720 },
          width: { ideal: 1280 },
        },
      });

      // A browser permission prompt may resolve after switching away or unmounting.
      if (!mountedRef.current || request !== requestRef.current) {
        stopStream(nextStream);
        return;
      }

      streamRef.current = nextStream;
      setStream(nextStream);

      for (const track of nextStream.getVideoTracks()) {
        track.onended = () => {
          if (streamRef.current !== nextStream || !mountedRef.current) {
            return;
          }

          stopStream(nextStream);
          streamRef.current = null;
          setStream(null);
          setError("Camera disconnected. The simulated feed is available.");
        };
      }
    } catch (cause) {
      if (mountedRef.current && request === requestRef.current) {
        setError(cameraErrorMessage(cause));
      }
    } finally {
      if (mountedRef.current && request === requestRef.current) {
        pendingRef.current = false;
        setIsPending(false);
      }
    }
  }, []);

  const source: CameraSource = stream ? "webcam" : "simulated";

  return { error, isPending, source, startCamera, stopCamera, stream };
}
