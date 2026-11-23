import { it } from 'vitest';
import { chooseAction } from './ai';
import { newGame, step } from './engine';
import { card } from './cards';

// Slow (200 full games); runs locally only, skipped on GitHub Actions where CI=true.
it.skipIf(process.env.CI)('balance report', () => {
  const reasons: Record<string, number> = {};
  const plays: Record<string, number> = {};
  let firstWins = 0, turns = 0; const N = 200;
  for (let i = 0; i < N; i++) {
    let s = newGame({ seed: 1000 + i, first: 0 });
    while (s.winner === null) s = step(s, chooseAction(s, 'normal'));
    if (s.winner === 0) firstWins++;
    turns += s.turn;
    const r = s.winKind ?? 'draw';
    reasons[r] = (reasons[r] ?? 0) + 1;
    for (const l of s.log) if (l.kind === 'play') plays[card(l.cardId!).name] = (plays[card(l.cardId!).name] ?? 0) + 1;
  }
  console.log({ firstWins, avgTurns: turns / N, reasons });
  console.log(Object.entries(plays).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
}, 120_000);
