// The feedback report: what the feedback button copies for the producer to paste into
// /feedback. No DOM, so it's tested in Node.

export interface Feedback {
  build: string;
  commit: string;
  /** The scenario's id, or empty when the game started without one. */
  scenario: string;
  /** Seconds played when the form was opened. */
  seconds: number;
  fun?: number;
  difficulty?: "too-easy" | "right" | "too-hard";
  frustration?: number;
  notes: string;
  /** The handoff card's questions, with the answers given. */
  answers: { question: string; answer: string }[];
  /** The run since the start (or the last restart), as a replay's text (replay.ts). */
  replay: string;
}

/**
 * Which build this is, from the page's path on Pages: a PR preview, the latest game,
 * or an alpha or beta build. Anything else (a dev server) is "dev".
 */
export function buildName(pathname: string): string {
  const preview = /\/preview\/(pr-\d+)\//.exec(pathname);
  if (preview) return `preview/${preview[1]}`;
  const build = /\/builds\/([\w.-]+)\//.exec(pathname);
  if (build) return `builds/${build[1]}`;
  if (/\/pixelbob\/game\//.test(pathname)) return "game";
  return "dev";
}

/** The report as text, in the shape /feedback reads (the front matter of a playtest report). */
export function report(f: Feedback): string {
  const lines = [
    "Pixelbob feedback",
    "---",
    `build: ${f.build}`,
    `commit: ${f.commit}`,
    `scenario: ${f.scenario || "none"}`,
    `played: ${f.seconds.toFixed(0)} s`,
    `fun: ${f.fun ?? "?"}`,
    `difficulty: ${f.difficulty ?? "?"}`,
    `frustration: ${f.frustration ?? "?"}`,
    "---",
    "",
    "## What they said",
    f.notes.trim() || "(nothing)",
  ];
  if (f.answers.length) {
    lines.push("", "## The card's questions");
    for (const a of f.answers) lines.push(`- ${a.question}`, `  ${a.answer.trim() || "(not answered)"}`);
  }
  // Fenced, so it pastes whole; game/scripts/replays.ts --add keeps it as a test.
  lines.push("", "## Replay", "```", f.replay.trim() || "none", "```");
  return lines.join("\n") + "\n";
}
