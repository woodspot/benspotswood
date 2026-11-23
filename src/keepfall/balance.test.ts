import { it } from 'vitest';
import { chooseAction } from './ai';
import { card } from './cards';
import { newGame, step } from './engine';
import { FACTIONS, type FactionId } from './factions';

// Slow (hundreds of full games); runs locally only, skipped on GitHub Actions where CI=true.
it.skipIf(process.env.CI)('balance report', () => {
  const reasons: Record<string, number> = {};
  const plays: Record<string, number> = {};
  const fac: Record<string, { w: number; g: number }> = {};
  let firstWins = 0, turns = 0, n = 0;
  const ids = FACTIONS.map((f) => f.id);
  // Every faction pairing (incl. mirrors), both seat orders.
  for (const a of ids) for (const b of ids) for (let i = 0; i < 30; i++) {
    let s = newGame({ seed: 1000 + n, first: 0, factions: [a, b] as [FactionId, FactionId] });
    while (s.winner === null) s = step(s, chooseAction(s, 'normal'));
    n++;
    if (s.winner === 0) firstWins++;
    turns += s.turn;
    const r = s.winKind ?? 'draw';
    reasons[r] = (reasons[r] ?? 0) + 1;
    if (a !== b) {
      for (const [seat, f] of [[0, a], [1, b]] as const) {
        fac[f] ??= { w: 0, g: 0 };
        fac[f].g++;
        if (s.winner === seat) fac[f].w++;
      }
    }
    for (const l of s.log) if (l.kind === 'play') plays[card(l.cardId!).name] = (plays[card(l.cardId!).name] ?? 0) + 1;
  }
  const facPct = Object.fromEntries(Object.entries(fac).map(([k, v]) => [k, `${Math.round((100 * v.w) / v.g)}%`]));
  console.log({ games: n, firstWinPct: Math.round((100 * firstWins) / n), avgTurns: Math.round(turns / n), reasons, factionWinPct: facPct });
  console.log(Object.entries(plays).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
}, 300_000);
