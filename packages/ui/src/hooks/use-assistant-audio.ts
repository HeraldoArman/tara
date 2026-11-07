"use client";

import type { AssistantState } from "@tara/ui/lib/assistant";
import {
  type AssistantAudioPlayer,
  createAssistantAudioPlayer,
  getAssistantSoundCue,
} from "@tara/ui/lib/assistant-audio";
import { useCallback, useEffect, useRef, useState } from "react";

export function useAssistantAudio() {
  const [enabled, setAudioEnabled] = useState(true);
  const enabledRef = useRef<boolean>(true);
  const playerRef = useRef<AssistantAudioPlayer | null>(null);

  const getPlayer = useCallback(() => {
    playerRef.current ??= createAssistantAudioPlayer();
    return playerRef.current;
  }, []);

  const setEnabled = useCallback(
    (value: boolean) => {
      enabledRef.current = value;
      setAudioEnabled(value);
      if (value) {
        getPlayer().unlock();
      } else {
        playerRef.current?.stop();
      }
    },
    [getPlayer]
  );

  const playTransition = useCallback(
    (from: AssistantState, to: AssistantState) => {
      const cue = getAssistantSoundCue(from, to);
      if (enabledRef.current && cue) {
        getPlayer().play(cue);
      }
    },
    [getPlayer]
  );

  useEffect(
    () => () => {
      playerRef.current?.dispose();
      playerRef.current = null;
    },
    []
  );

  return { enabled, playTransition, setEnabled };
}
