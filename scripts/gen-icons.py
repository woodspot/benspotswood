# Makes the Home Screen icons (public/<game>/icon-180.png, icon-512.png): an emoji on a rounded colour square.
# Run: python scripts/gen-icons.py   (Windows: uses the Segoe UI Emoji font)
from PIL import Image, ImageDraw, ImageFont
import os
GAMES = {
  'phone': ('📱', '#5aa9f0'), 'balloons': ('🎈', '#5aa9f0'), 'match': ('🃏', '#4fb38a'),
  'barnyard': ('🐮', '#6cc2f0'), 'kids': ('🧸', '#3f8fe0'), 'trail': ('🦉', '#3a9a5b'), 'abc': ('🔤', '#7b5cd6'), 'skyhold': ('🎈', '#1a2050'), 'skyarmada': ('🛩️', '#141826'),
  'band': ('🥁', '#5b3fb5'), 'care': ('🛁', '#4fb8d8'), 'dentist': ('🦷', '#3cc0b4'),
}
FONT = 'C:/Windows/Fonts/seguiemj.ttf'
for game, (emoji, bg) in GAMES.items():
  for size in (180, 512):
    img = Image.new('RGBA', (size, size), bg)
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, int(size * 0.6))
    d.text((size / 2, size / 2), emoji, font=font, anchor='mm', embedded_color=True)
    os.makedirs(f'public/{game}', exist_ok=True)
    img.convert('RGB').save(f'public/{game}/icon-{size}.png', optimize=True)
print('ok')
