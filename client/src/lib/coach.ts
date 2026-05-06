export interface CoachReport {
  headline: string;
  verdict: "excellent" | "solid" | "needs-work";
  notes: string[];
}

export interface SoloCoachInput {
  difficulty: "easy" | "medium" | "hard";
  winner: "player" | "bot";
  rounds: number;
  playerShots: number;
  playerHits: number;
  botShots: number;
  botHits: number;
  durationSec: number;
}

export interface PvpCoachInput {
  winner: "you" | "opponent";
  rounds: number;
  yourShots: number;
  yourHits: number;
  opponentShots: number;
  opponentHits: number;
  yourDecksLeft: number;
  enemyDecksLeft: number;
}

function percent(hits: number, shots: number): number {
  if (shots <= 0) return 0;
  return Math.round((hits / shots) * 100);
}

function verdictFromAccuracy(accuracy: number): CoachReport["verdict"] {
  if (accuracy >= 46) return "excellent";
  if (accuracy >= 30) return "solid";
  return "needs-work";
}

export function buildSoloCoach(input: SoloCoachInput): CoachReport {
  const accuracy = percent(input.playerHits, input.playerShots);
  const botAccuracy = percent(input.botHits, input.botShots);
  const notes: string[] = [];

  if (accuracy < 30) {
    notes.push(
      "Your hit rate is low. Use a hunt pattern first, then immediately target adjacent cells after a hit."
    );
  } else if (accuracy < 46) {
    notes.push(
      "Your hit rate is stable. Keep using parity-style search and commit faster to finishing damaged ships."
    );
  } else {
    notes.push(
      "Strong precision. You are converting information into hits efficiently."
    );
  }

  if (botAccuracy - accuracy >= 12) {
    notes.push(
      "Bot outperformed your shot efficiency. Prioritize reducing random shots in the mid game."
    );
  } else if (accuracy - botAccuracy >= 12) {
    notes.push(
      "You controlled shot efficiency better than the bot. Keep this pressure on turn transitions."
    );
  } else {
    notes.push("Shot efficiency was close. Endgame discipline likely decided this match.");
  }

  if (input.winner === "player" && input.difficulty === "hard") {
    notes.push("Hard-mode win confirmed. Your decision pace was tournament-ready.");
  }

  if (input.winner === "bot" && input.durationSec < 50) {
    notes.push(
      "Fast loss signal: opening was too loose. Spend first two rounds on structured coverage."
    );
  }

  return {
    headline:
      input.winner === "player"
        ? "AI Coach: clean offensive momentum."
        : "AI Coach: rebuild hunt discipline.",
    verdict: verdictFromAccuracy(accuracy),
    notes: notes.slice(0, 4),
  };
}

export function buildPvpCoach(input: PvpCoachInput): CoachReport {
  const yourAccuracy = percent(input.yourHits, input.yourShots);
  const opponentAccuracy = percent(input.opponentHits, input.opponentShots);
  const notes: string[] = [];

  if (yourAccuracy < 30) {
    notes.push(
      "Your attack map was too noisy. Keep a cleaner parity rhythm before switching to target mode."
    );
  } else if (yourAccuracy < 46) {
    notes.push(
      "Balanced pressure. With slightly better conversion after first hits, this becomes a dominant line."
    );
  } else {
    notes.push("Excellent conversion. You capitalized on confirmed information very well.");
  }

  if (input.winner === "you" && input.yourDecksLeft >= 4) {
    notes.push(
      "You won with a healthy defense. Opponent struggled to track your ship geometry."
    );
  }

  if (input.winner === "opponent" && input.enemyDecksLeft >= 4) {
    notes.push(
      "Opponent retained too many decks. Next match: tighten your first two salvos and avoid broad random spread."
    );
  }

  if (opponentAccuracy - yourAccuracy >= 12) {
    notes.push(
      "Opponent had a higher hit conversion. Focus on finishing partially found ships before scanning elsewhere."
    );
  } else if (yourAccuracy - opponentAccuracy >= 12) {
    notes.push(
      "You had the stronger conversion. Keep that tempo and reduce defensive predictability."
    );
  }

  if (input.rounds >= 9) {
    notes.push(
      "Long duel: stamina mattered. Consider a faster decision heuristic for final rounds."
    );
  }

  return {
    headline:
      input.winner === "you"
        ? "AI Coach: winning structure detected."
        : "AI Coach: tactical reset recommended.",
    verdict: verdictFromAccuracy(yourAccuracy),
    notes: notes.slice(0, 4),
  };
}
