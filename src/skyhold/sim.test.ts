import { describe, expect, it } from 'vitest';
import {
  addCar, canPlace, CLOUD_TOP, demolish, DOCK_X, layout, liftAction, newWorld, place, population, targetAltitude, tick,
  upgradeEnvelope, type World,
} from './sim';

const SHAFT = DOCK_X + 4; // a lift rising from the middle of the dock

/** A lift from the dock up to `top`, a cabin either side on every floor, and a café. */
function city(top = 5): World {
  const w = newWorld(3);
  w.money = 1e6;
  for (let y = 1; y <= top; y++) {
    expect(liftAction(w, SHAFT, y).ok).toBe(true);
    expect(place(w, 'cabin', SHAFT + 1, y).ok).toBe(true);
    expect(place(w, 'cabin', SHAFT - 2, y).ok).toBe(true);
  }
  expect(place(w, 'cafe', SHAFT + 3, 1).ok).toBe(true);
  w.money = 5000;
  return w;
}

const days = (w: World, n: number) => {
  for (let i = 0; i < n * 24; i++) tick(w);
};

describe('skyhold', () => {
  it('rooms must touch the city, not overlap, and be unlocked', () => {
    const w = newWorld(1);
    expect(canPlace(w, 'cabin', DOCK_X, 1).ok).toBe(true); // on top of the dock
    expect(canPlace(w, 'cabin', DOCK_X, 3).ok).toBe(false); // floating
    expect(canPlace(w, 'cabin', DOCK_X, 0).ok).toBe(false); // the dock is there
    expect(canPlace(w, 'shop', DOCK_X, 1)).toEqual({ ok: false, why: 'Unlocks at 2 stars' });
  });

  it('lifts extend from their ends', () => {
    const w = newWorld(1);
    expect(liftAction(w, SHAFT, 1)).toMatchObject({ ok: true, extended: false });
    expect(liftAction(w, SHAFT, 2)).toMatchObject({ ok: true, extended: true });
    expect(w.lifts).toHaveLength(1);
    expect(w.lifts[0]).toMatchObject({ y0: 1, y1: 2 });
  });

  it('a room above the dock needs a lift (one built on the dock carries people up)', () => {
    const w = newWorld(1);
    w.money = 1e6;
    place(w, 'cabin', SHAFT + 1, 1);
    const cabin = w.rooms[1];
    expect(layout(w).path.get(cabin.id)).toBeNull();
    liftAction(w, SHAFT, 1);
    expect(layout(w).path.get(cabin.id)).toHaveLength(1);
    // Ground-floor rooms joined to the dock need no lift.
    place(w, 'cabin', DOCK_X + 8, 0);
    expect(layout(w).path.get(w.rooms.at(-1)!.id)).toEqual([]);
  });

  it('won’t demolish something that would leave rooms hanging in the air', () => {
    const w = newWorld(1);
    w.money = 1e6;
    place(w, 'cabin', DOCK_X, 1);
    place(w, 'cabin', DOCK_X, 2);
    const [, lower, upper] = w.rooms;
    expect(demolish(w, { room: lower }).ok).toBe(false);
    expect(demolish(w, { room: upper }).ok).toBe(true);
    expect(demolish(w, { room: lower }).ok).toBe(true);
    expect(demolish(w, { room: w.rooms[0] }).ok).toBe(false); // the dock
  });

  it('a small city fills up and pays its way', () => {
    const w = city();
    const money = w.money;
    days(w, 8);
    expect(population(w)).toBeGreaterThan(20);
    expect(w.money).toBeGreaterThan(money + 3000);
    expect(w.history.length).toBe(8);
  });

  it('a 40-person city earns its second star', () => {
    const w = city(8);
    days(w, 10);
    expect(population(w)).toBeGreaterThanOrEqual(40);
    expect(w.stars).toBe(2);
  });

  it('too much weight sinks Skyhold into the clouds; more lift fixes it', () => {
    const w = city();
    w.money = 1e7;
    for (let y = 6; y <= 24; y++) {
      liftAction(w, SHAFT, y);
      place(w, 'cabin', SHAFT + 1, y);
      place(w, 'cabin', SHAFT - 2, y);
    }
    expect(targetAltitude(w)).toBeLessThan(CLOUD_TOP);
    while (upgradeEnvelope(w).ok);
    expect(targetAltitude(w)).toBeGreaterThan(CLOUD_TOP);
  });

  it('an overcrowded lift upsets people; more cars help', () => {
    const w = city(18);
    w.money = 1e6;
    days(w, 6);
    const crowded = w.rooms.filter((r) => r.type === 'cabin').reduce((t, r) => t + r.mood, 0);
    const w2 = city(18);
    w2.money = 1e6;
    while (addCar(w2, w2.lifts[0].id).ok);
    days(w2, 6);
    const roomy = w2.rooms.filter((r) => r.type === 'cabin').reduce((t, r) => t + r.mood, 0);
    expect(roomy).toBeGreaterThan(crowded);
  });
});
