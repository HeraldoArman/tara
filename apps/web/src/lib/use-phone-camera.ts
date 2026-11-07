"use client";

import { RemoteVideoTrack, type Room, RoomEvent, Track } from "livekit-client";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "./api";

export interface PhonePairing {
  claimed: boolean;
  expiresAt: string;
  id: string;
  participantIdentity: string;
}

export function usePhoneCamera({
  connection,
  enabled,
  room,
  runId,
  stopLocalCamera,
}: {
  connection: string;
  enabled: boolean;
  room: RefObject<Room | null>;
  runId: string;
  stopLocalCamera: () => Promise<void>;
}) {
  const [pairing, setPairing] = useState<PhonePairing | null>(null);
  const pairingRef = useRef<PhonePairing | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const request = useRef(0);
  const mounted = useRef<boolean>(true);
  const refreshing = useRef<Promise<void> | null>(null);

  const clear = useCallback(() => {
    request.current += 1;
    pairingRef.current = null;
    if (mounted.current) {
      setPairing(null);
      setStream(null);
    }
  }, []);

  const refresh = useCallback((): Promise<void> => {
    if (refreshing.current) {
      return refreshing.current;
    }
    request.current += 1;
    const generation = request.current;
    const read = async () => {
      const result = await api<{ pairing: PhonePairing | null }>(
        `/runs/${runId}/camera-pairing`
      );
      if (!mounted.current || request.current !== generation) {
        return;
      }
      const previous = pairingRef.current;
      pairingRef.current = result.pairing;
      setPairing(result.pairing);
      if (
        result.pairing?.claimed &&
        (!previous?.claimed || previous.id !== result.pairing.id)
      ) {
        await stopLocalCamera();
      }
    };
    const pending = read().finally(() => {
      if (refreshing.current === pending) {
        refreshing.current = null;
      }
    });
    refreshing.current = pending;
    return pending;
  }, [runId, stopLocalCamera]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      pairingRef.current = null;
      setPairing(null);
      setStream(null);
      return () => {
        mounted.current = false;
        request.current += 1;
      };
    }
    refresh().catch(() => undefined);
    const interval = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 2500);
    return () => {
      mounted.current = false;
      request.current += 1;
      window.clearInterval(interval);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    const active = room.current;
    if (
      !(enabled && pairing?.claimed && active && connection === "connected")
    ) {
      setStream(null);
      return;
    }
    const reconcile = () => {
      const participant = active.remoteParticipants.get(
        pairing.participantIdentity
      );
      const publication = participant?.getTrackPublication(Track.Source.Camera);
      if (publication && !publication.isSubscribed) {
        publication.setSubscribed(true);
      }
      publication?.setEnabled(true);
      const track = publication?.track;
      if (
        track instanceof RemoteVideoTrack &&
        !publication?.isMuted &&
        track.mediaStreamTrack.readyState === "live"
      ) {
        setStream((previous) =>
          previous?.getVideoTracks()[0] === track.mediaStreamTrack
            ? previous
            : new MediaStream([track.mediaStreamTrack])
        );
      } else {
        setStream(null);
      }
    };
    active.on(RoomEvent.TrackSubscribed, reconcile);
    active.on(RoomEvent.TrackUnsubscribed, reconcile);
    active.on(RoomEvent.TrackPublished, reconcile);
    active.on(RoomEvent.TrackUnpublished, reconcile);
    active.on(RoomEvent.TrackMuted, reconcile);
    active.on(RoomEvent.TrackUnmuted, reconcile);
    active.on(RoomEvent.ParticipantDisconnected, reconcile);
    reconcile();
    return () => {
      active.off(RoomEvent.TrackSubscribed, reconcile);
      active.off(RoomEvent.TrackUnsubscribed, reconcile);
      active.off(RoomEvent.TrackPublished, reconcile);
      active.off(RoomEvent.TrackUnpublished, reconcile);
      active.off(RoomEvent.TrackMuted, reconcile);
      active.off(RoomEvent.TrackUnmuted, reconcile);
      active.off(RoomEvent.ParticipantDisconnected, reconcile);
    };
  }, [connection, enabled, pairing, room]);

  return {
    clear,
    connected: stream !== null && connection === "connected",
    pairing,
    pairingRef,
    refresh,
    stream: connection === "connected" ? stream : null,
  };
}
