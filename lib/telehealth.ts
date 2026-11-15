/**
 * Video provider abstraction for telehealth visits.
 *
 * MOCK (default) renders a placeholder video tile so the waiting room, admit,
 * split-screen, and timing flows work end to end without a vendor.
 *
 * DAILY (TELEHEALTH_PROVIDER=daily) is the planned production provider. It
 * needs DAILY_API_KEY and a signed BAA, and isn't implemented yet: wire
 * createRoom/joinUrl to Daily's REST API (private rooms, short-lived meeting
 * tokens, recording off) once both are in place, and test it against Daily
 * before enabling it.
 */

export interface VideoRoom {
  name: string;
  /** Null for the mock provider (the UI shows a placeholder tile). */
  url: string | null;
}

export interface VideoProvider {
  readonly id: "MOCK" | "DAILY";
  createRoom(name: string, expiresAt: Date): Promise<VideoRoom>;
  /** A short-lived join link for one participant. */
  joinUrl(room: VideoRoom, participant: { name: string; isHost: boolean }): Promise<string | null>;
}

const mockProvider: VideoProvider = {
  id: "MOCK",
  async createRoom(name) {
    return { name, url: null };
  },
  async joinUrl() {
    return null;
  },
};

export function videoProvider(): VideoProvider {
  if (process.env.TELEHEALTH_PROVIDER === "daily") {
    throw new Error("The Daily video provider isn't configured yet (needs DAILY_API_KEY and a signed BAA). See lib/telehealth.ts.");
  }
  return mockProvider;
}

/**
 * Time-based psychotherapy codes (AMA CPT time rules): the session length must
 * fall in the code's range. Returns a warning when it doesn't.
 */
const TIME_RULES: Record<string, { min: number; max: number; label: string }> = {
  "90832": { min: 16, max: 37, label: "30-minute psychotherapy (16–37 min)" },
  "90834": { min: 38, max: 52, label: "45-minute psychotherapy (38–52 min)" },
  "90837": { min: 53, max: Infinity, label: "60-minute psychotherapy (53+ min)" },
};

export function timeBasedCodeWarning(cptCode: string, minutes: number | null | undefined): string | null {
  const rule = TIME_RULES[cptCode];
  if (!rule || minutes == null) return null;
  if (minutes >= rule.min && minutes <= rule.max) return null;
  const better = Object.entries(TIME_RULES).find(([, r]) => minutes >= r.min && minutes <= r.max)?.[0];
  return `${cptCode} is ${rule.label}, but the recorded session was ${minutes} minutes.${better ? ` ${better} fits that length.` : minutes < 16 ? " Sessions under 16 minutes aren't billable as psychotherapy." : ""}`;
}
