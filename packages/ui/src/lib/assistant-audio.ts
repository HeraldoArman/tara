import type { AssistantState } from "./assistant";

export type AssistantSoundCue =
  | "online"
  | "success"
  | "warning"
  | "cooldown"
  | "sleep"
  | "ready";

interface Tone {
  duration: number;
  endFrequency?: number;
  frequency: number;
  offset: number;
  volume?: number;
  waveform?: OscillatorType;
}

const tones: Record<AssistantSoundCue, readonly Tone[]> = {
  cooldown: [
    { duration: 0.42, endFrequency: 330, frequency: 660, offset: 0 },
    { duration: 0.2, frequency: 330, offset: 0.3, volume: 0.035 },
  ],
  online: [
    { duration: 0.14, frequency: 440, offset: 0, volume: 0.035 },
    { duration: 0.2, frequency: 660, offset: 0.13, volume: 0.035 },
  ],
  ready: [{ duration: 0.11, frequency: 660, offset: 0, volume: 0.025 }],
  sleep: [{ duration: 0.32, endFrequency: 180, frequency: 330, offset: 0 }],
  success: [
    { duration: 0.16, frequency: 659.25, offset: 0 },
    { duration: 0.18, frequency: 880, offset: 0.1 },
    { duration: 0.22, frequency: 1108.73, offset: 0.2 },
  ],
  warning: [
    { duration: 0.12, frequency: 740, offset: 0, waveform: "triangle" },
    { duration: 0.12, frequency: 554.37, offset: 0.18, waveform: "triangle" },
    { duration: 0.15, frequency: 740, offset: 0.36, waveform: "triangle" },
  ],
};

export function getAssistantSoundCue(
  from: AssistantState,
  to: AssistantState
): AssistantSoundCue | null {
  if (from === to) {
    return null;
  }
  if (to !== "active") {
    return to;
  }
  if (from === "sleep") {
    return "online";
  }
  return from === "warning" ? "cooldown" : "ready";
}

interface PlayingTone {
  gain: GainNode;
  oscillator: OscillatorNode;
}

export interface AssistantAudioPlayer {
  dispose: () => void;
  play: (cue: AssistantSoundCue) => void;
  stop: () => void;
  unlock: () => void;
}

/** Browser resources are allocated only when a user starts or enables audio. */
export function createAssistantAudioPlayer(): AssistantAudioPlayer {
  let context: AudioContext | null = null;
  let utterance: SpeechSynthesisUtterance | null = null;
  let generation = 0;
  let disposed = false;
  const playing = new Set<PlayingTone>();

  function getContext(): AudioContext | null {
    if (disposed || typeof window === "undefined") {
      return null;
    }
    if (context) {
      return context;
    }
    if (!("AudioContext" in window)) {
      return null;
    }
    try {
      context = new window.AudioContext({ latencyHint: "interactive" });
      return context;
    } catch {
      return null;
    }
  }

  function disconnect(tone: PlayingTone) {
    tone.oscillator.onended = null;
    tone.oscillator.disconnect();
    tone.gain.disconnect();
    playing.delete(tone);
  }

  function stop() {
    generation += 1;
    for (const tone of playing) {
      tone.oscillator.stop();
      disconnect(tone);
    }
    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
      utterance = null;
      window.speechSynthesis.cancel();
    }
  }

  function scheduleTone(audioContext: AudioContext, tone: Tone, start: number) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const source = { gain, oscillator };
    const end = start + tone.duration;
    oscillator.type = tone.waveform ?? "sine";
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    if (tone.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
    }
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(tone.volume ?? 0.055, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end - 0.01);
    gain.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.onended = () => disconnect(source);
    oscillator.start(start);
    oscillator.stop(end);
    playing.add(source);
  }

  async function playTones(
    cue: AssistantSoundCue,
    requestedGeneration: number
  ) {
    const audioContext = getContext();
    if (!audioContext) {
      return;
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    if (
      disposed ||
      generation !== requestedGeneration ||
      audioContext.state !== "running"
    ) {
      return;
    }
    const start = audioContext.currentTime + 0.015;
    for (const tone of tones[cue]) {
      scheduleTone(audioContext, tone, start + tone.offset);
    }
  }

  function speakOnline() {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      return;
    }
    try {
      const message = new window.SpeechSynthesisUtterance("TARA is online");
      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find(
          (item) => item.localService && item.lang.startsWith("en")
        ) ?? voices.find((item) => item.lang.startsWith("en"));
      if (voice) {
        message.voice = voice;
      }
      message.lang = "en-US";
      message.rate = 1.04;
      message.volume = 0.72;
      const release = () => {
        if (utterance === message) {
          utterance = null;
        }
      };
      message.onend = release;
      message.onerror = release;
      utterance = message;
      window.speechSynthesis.speak(message);
    } catch {
      // The wake chime also works when speech voices are unavailable.
      utterance = null;
    }
  }

  async function unlock() {
    const audioContext = getContext();
    if (audioContext?.state === "suspended") {
      await audioContext.resume();
    }
  }

  async function closeContext(audioContext: AudioContext) {
    await audioContext.close();
  }

  return {
    dispose() {
      stop();
      disposed = true;
      if (context && context.state !== "closed") {
        closeContext(context).catch(() => {
          // Some browsers close the context when its document is discarded.
        });
      }
      context = null;
    },
    play(cue) {
      if (disposed) {
        return;
      }
      stop();
      if (cue === "online") {
        speakOnline();
      }
      playTones(cue, generation).catch(() => {
        // Browser audio restrictions must never block the assistant's state change.
      });
    },
    stop,
    unlock() {
      unlock().catch(() => {
        // A later gesture can retry a context blocked by the browser.
      });
    },
  };
}
