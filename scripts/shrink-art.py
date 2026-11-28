"""Makes the small game pictures from the full-size drawings.

    python scripts/shrink-art.py art-raw

Each <id>.webp in the folder is trimmed to its drawing (see-through edges cut away), centred on a
square with a little margin, shrunk to 320px and saved to src/kids/art/<id>.webp (about 20 KB).
Needs Pillow.
"""
import sys
from pathlib import Path

from PIL import Image

SIZE = 320
MARGIN = 0.04  # of the square, on each side
OUT = Path('src/kids/art')


def shrink(src: Path) -> Path:
    im = Image.open(src).convert('RGBA')
    box = im.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
    if box:
        im = im.crop(box)
    side = round(max(im.size) / (1 - 2 * MARGIN))
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    square = square.resize((SIZE, SIZE), Image.LANCZOS)
    dest = OUT / f'{src.stem}.webp'
    square.save(dest, 'WEBP', quality=82, method=6)
    return dest


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else 'art-raw')
    for f in sorted(folder.glob('*.webp')):
        d = shrink(f)
        print(f'{d}  {d.stat().st_size // 1024} KB')
