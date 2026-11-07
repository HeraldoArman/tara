"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function usePhoneLandscape() {
  const [portrait, setPortrait] = useState(true);
  const mounted = useRef<boolean>(false);
  const enteredFullscreen = useRef<boolean>(false);
  const locked = useRef<boolean>(false);

  const release = useCallback(() => {
    if (locked.current) {
      try {
        screen.orientation?.unlock();
      } catch {
        // A hidden or inactive document may no longer permit orientation changes.
      }
      locked.current = false;
    }
    if (
      enteredFullscreen.current &&
      document.fullscreenElement === document.documentElement
    ) {
      document.exitFullscreen().catch(() => undefined);
    }
    enteredFullscreen.current = false;
  }, []);

  useEffect(() => {
    mounted.current = true;
    const query = window.matchMedia("(orientation: portrait)");
    const update = () => setPortrait(query.matches);
    update();
    query.addEventListener("change", update);
    return () => {
      mounted.current = false;
      query.removeEventListener("change", update);
      release();
    };
  }, [release]);

  const enterLandscape = useCallback(async (): Promise<boolean> => {
    try {
      if (typeof screen.orientation?.lock === "function") {
        // Fullscreen must be requested in the original tap, before camera/API awaits.
        if (
          !document.fullscreenElement &&
          document.documentElement.requestFullscreen
        ) {
          await document.documentElement.requestFullscreen({
            navigationUI: "hide",
          });
          enteredFullscreen.current = true;
        }
        if (!mounted.current) {
          release();
          return false;
        }
        await screen.orientation.lock("landscape");
        locked.current = true;
      }
    } catch {
      // Browsers without orientation locking use the rotate-phone instruction.
    }
    if (!mounted.current) {
      release();
      return false;
    }
    const vertical = window.matchMedia("(orientation: portrait)").matches;
    setPortrait(vertical);
    return !vertical;
  }, [release]);

  return { enterLandscape, portrait };
}
