/** JEV proxy-si ilə danışıq + sessiya ölçmələri. */

export class JevSession {
  constructor() {
    this.reset();
  }

  reset() {
    this.calls = 0;
    this.questions = 0;
    this.tokens = 0;
    this.costUsd = 0;
    this.latencies = [];
  }

  get medianLatency() {
    if (!this.latencies.length) return 0;
    const s = [...this.latencies].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  get totalLatency() {
    return this.latencies.reduce((a, b) => a + b, 0);
  }

  async call(state, questions, { signal } = {}) {
    const res = await fetch("/api/jev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, questions }),
      signal,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

    this.calls += 1;
    this.questions += json.questionCount || 0;
    this.tokens += json.usage.inputTokens;
    this.costUsd += json.usage.costUsd;
    this.latencies.push(json.latencyMs);
    return json;
  }
}

/** score cavabını [min,max] aralığına çevirir (kəsilməz — səviyyələr arasında qala bilər). */
export function scoreTo(answer, min, max, levels = 10) {
  const t = Math.max(0, Math.min(1, answer.score / (levels - 1)));
  return min + t * (max - min);
}

/** 0–9 rubrikası. */
export const LEVELS_10 = [
  "0 — ən aşağı",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9 — ən yüksək",
];
