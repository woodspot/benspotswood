"""Makes the real animal sounds for Barnyard and the Toy Phone.

    python scripts/gen-sounds.py [id ...]

For each sound in scripts/animal-sounds.json (or just the ids given): downloads the recording, finds
its loudest stretch of at most 'max' seconds, trims the quiet ends, levels it so every animal is about
as loud as the others, fades the ends and saves src/kids/sounds/<id>.mp3 (mono, small). Also writes
public/sounds/CREDITS.txt (linked from the games' grown-ups panel). Needs ffmpeg. Usually run by the "Animal sounds" GitHub workflow.
"""
import json
import math
import subprocess
import sys
import tempfile
import urllib.request
from array import array
from pathlib import Path

SR = 22050
FRAME = SR // 50  # 20 ms
TARGET_RMS = 0.16  # loudness of the sound's active part (about -16 dBFS)
PEAK = 0.89  # never louder than -1 dBFS
OUT = Path('src/kids/sounds')
UA = {'User-Agent': 'Mozilla/5.0 (kids-games sound builder)'}


def decode(path: Path) -> list[float]:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                         check=True, capture_output=True).stdout
    a = array('h')
    a.frombytes(raw[: len(raw) // 2 * 2])
    return [s / 32768 for s in a]


def best_stretch(x: list[float], max_s: float) -> list[float]:
    n = len(x) // FRAME
    rms = [math.sqrt(sum(v * v for v in x[i * FRAME:(i + 1) * FRAME]) / FRAME) for i in range(n)]
    if not rms:
        return x
    w = min(n, int(max_s * 50))
    # The window of w frames with the most energy.
    energy = [r * r for r in rms]
    cur = sum(energy[:w])
    best, start = cur, 0
    for i in range(1, n - w + 1):
        cur += energy[i + w - 1] - energy[i - 1]
        if cur > best:
            best, start = cur, i
    win = rms[start:start + w]
    thr = 0.12 * max(win)
    first = next(i for i, r in enumerate(win) if r >= thr)
    last = len(win) - 1 - next(i for i, r in enumerate(reversed(win)) if r >= thr)
    a = max(0, start + first - 2)
    b = min(n, start + last + 6)
    return x[a * FRAME:b * FRAME]


def level(x: list[float], gain: float) -> list[float]:
    frames = [x[i:i + FRAME] for i in range(0, len(x), FRAME)]
    rms = [math.sqrt(sum(v * v for v in f) / len(f)) for f in frames if f]
    loud = [r for r in rms if r >= 0.25 * max(rms)] or rms
    active = math.sqrt(sum(r * r for r in loud) / len(loud))
    g = TARGET_RMS / max(active, 1e-6)
    g = min(g, PEAK / max(max(abs(v) for v in x), 1e-6)) * gain
    y = [v * g for v in x]
    fin, fout = int(0.015 * SR), int(0.12 * SR)
    for i in range(min(fin, len(y))):
        y[i] *= i / fin
    for i in range(min(fout, len(y))):
        y[-1 - i] *= i / fout
    return y


def encode(y: list[float], dest: Path) -> None:
    pcm = array('h', (max(-32767, min(32767, int(v * 32767))) for v in y)).tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', '64k', str(dest)], input=pcm, check=True)


def main() -> None:
    sounds = json.loads(Path('scripts/animal-sounds.json').read_text(encoding='utf-8'))['sounds']
    only = sys.argv[1:]
    OUT.mkdir(parents=True, exist_ok=True)
    failed = []
    with tempfile.TemporaryDirectory() as tmp:
        for sid, s in sounds.items():
            if only and sid not in only:
                continue
            try:
                if s['src'].startswith('http'):
                    src = Path(tmp) / (sid + Path(s['src'].split('?')[0]).suffix)
                    with urllib.request.urlopen(urllib.request.Request(s['src'], headers=UA), timeout=60) as r:
                        src.write_bytes(r.read())
                else:  # a file kept in the repo (scripts/sound-src/)
                    src = Path(s['src'])
                y = level(best_stretch(decode(src), s['max']), s.get('gain', 1.0))
                dest = OUT / f'{sid}.mp3'
                encode(y, dest)
                print(f'✓ {sid:8} {len(y) / SR:4.1f}s  {dest.stat().st_size // 1024} KB')
            except Exception as e:  # keep going: one bad download shouldn't stop the rest
                print(f'✗ {sid}: {e}')
                failed.append(sid)
    lines = ['Animal sounds used in Barnyard and the Toy Phone (trimmed and levelled):', '']
    for sid, s in sounds.items():
        lines.append(f"{sid}: \"{s['title']}\" by {s['by']}, {s['licence']}" + (f", {s['page']}" if s.get('page') else ''))
    Path('public/sounds').mkdir(parents=True, exist_ok=True)
    (Path('public/sounds') / 'CREDITS.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    if failed:
        sys.exit(f'failed: {", ".join(failed)}')


if __name__ == '__main__':
    main()
