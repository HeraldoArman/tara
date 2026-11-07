import { afterEach, expect, test } from "bun:test";
import {
  createAssistantAudioPlayer,
  getAssistantSoundCue,
} from "../../packages/ui/src/lib/assistant-audio";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

class AudioParameter {
  value = 0;

  setValueAtTime(value: number) {
    this.value = value;
  }

  exponentialRampToValueAtTime() {
    return this;
  }

  linearRampToValueAtTime() {
    return this;
  }
}

class TestNode {
  disconnected = false;

  connect() {
    return this;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class TestOscillator extends TestNode {
  frequency = new AudioParameter();
  onended: (() => void) | null = null;
  started = false;
  stops: (number | undefined)[] = [];
  type = "sine";

  start() {
    this.started = true;
  }

  stop(at?: number) {
    this.stops.push(at);
  }
}

class TestGain extends TestNode {
  gain = new AudioParameter();
}

class TestUtterance {
  lang = "";
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  rate = 1;
  text: string;
  volume = 1;

  constructor(text: string) {
    this.text = text;
  }
}

function installAudio({ suspended = false, rejectResume = false } = {}) {
  const contexts: TestAudioContext[] = [];
  const pendingResumes: (() => void)[] = [];
  const messages: TestUtterance[] = [];
  let speechCancellations = 0;

  class TestAudioContext {
    closed = false;
    currentTime = 1;
    destination = new TestNode();
    oscillators: TestOscillator[] = [];
    state = suspended ? "suspended" : "running";

    constructor() {
      contexts.push(this);
    }

    close() {
      this.closed = true;
      this.state = "closed";
      return Promise.resolve();
    }

    createGain() {
      return new TestGain();
    }

    createOscillator() {
      const oscillator = new TestOscillator();
      this.oscillators.push(oscillator);
      return oscillator;
    }

    resume() {
      if (rejectResume) {
        return Promise.reject(new Error("Audio permission denied"));
      }
      return new Promise<void>((resolve) => {
        pendingResumes.push(() => {
          this.state = "running";
          resolve();
        });
      });
    }
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      AudioContext: TestAudioContext,
      SpeechSynthesisUtterance: TestUtterance,
      speechSynthesis: {
        cancel() {
          speechCancellations += 1;
        },
        getVoices() {
          return [];
        },
        speak(message: TestUtterance) {
          messages.push(message);
        },
      },
    },
  });

  return {
    contexts,
    messages,
    pendingResumes,
    speechCancellations: () => speechCancellations,
  };
}

test("wake, recovery, and automatic success return have distinct feedback", () => {
  expect(getAssistantSoundCue("sleep", "active")).toBe("online");
  expect(getAssistantSoundCue("warning", "active")).toBe("cooldown");
  expect(getAssistantSoundCue("success", "active")).toBe("ready");
  expect(getAssistantSoundCue("active", "active")).toBeNull();
});

test("creating and unlocking a player does not autoplay a cue", () => {
  const audio = installAudio();
  const player = createAssistantAudioPlayer();
  expect(audio.contexts).toHaveLength(0);
  player.unlock();
  expect(audio.contexts).toHaveLength(1);
  expect(audio.contexts[0]?.oscillators).toHaveLength(0);
  expect(audio.messages).toHaveLength(0);
  player.dispose();
});

test("muting while browser permission is pending prevents delayed playback", async () => {
  const audio = installAudio({ suspended: true });
  const player = createAssistantAudioPlayer();
  player.play("warning");
  player.stop();
  audio.pendingResumes[0]?.();
  await Promise.resolve();
  expect(audio.contexts[0]?.oscillators).toHaveLength(0);
  player.dispose();
});

test("a newer transition replaces a cue waiting for audio permission", async () => {
  const audio = installAudio({ suspended: true });
  const player = createAssistantAudioPlayer();
  player.play("warning");
  player.play("cooldown");
  for (const resume of audio.pendingResumes) {
    resume();
  }
  await Promise.resolve();
  expect(
    audio.contexts[0]?.oscillators.map((node) => node.frequency.value)
  ).toEqual([660, 330]);
  player.dispose();
});

test("disposal closes resources and prevents a pending cue from reviving", async () => {
  const audio = installAudio({ suspended: true });
  const player = createAssistantAudioPlayer();
  player.play("success");
  player.dispose();
  audio.pendingResumes[0]?.();
  await Promise.resolve();
  player.play("warning");
  expect(audio.contexts).toHaveLength(1);
  expect(audio.contexts[0]?.closed).toBe(true);
  expect(audio.contexts[0]?.oscillators).toHaveLength(0);
});

test("replacing a playing cue stops and disconnects all previous sources", () => {
  const audio = installAudio();
  const player = createAssistantAudioPlayer();
  player.play("success");
  const previousSources = [...(audio.contexts[0]?.oscillators ?? [])];
  expect(previousSources).toHaveLength(3);
  player.play("sleep");
  for (const source of previousSources) {
    expect(source.stops).toContain(undefined);
    expect(source.disconnected).toBe(true);
  }
  player.dispose();
});

test("only owned speech is cancelled when feedback is interrupted", () => {
  const audio = installAudio();
  const player = createAssistantAudioPlayer();
  player.stop();
  expect(audio.speechCancellations()).toBe(0);
  player.play("online");
  expect(audio.messages[0]?.text).toBe("tara is online");
  player.play("warning");
  expect(audio.speechCancellations()).toBe(1);
  player.play("online");
  audio.messages[1]?.onend?.();
  player.stop();
  expect(audio.speechCancellations()).toBe(1);
  player.dispose();
});

test("unsupported or denied browser audio leaves transitions usable", async () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  const unavailable = createAssistantAudioPlayer();
  expect(() => unavailable.play("online")).not.toThrow();
  unavailable.dispose();

  const audio = installAudio({ rejectResume: true, suspended: true });
  const denied = createAssistantAudioPlayer();
  denied.play("success");
  await Promise.resolve();
  expect(audio.contexts[0]?.oscillators).toHaveLength(0);
  denied.dispose();
});
