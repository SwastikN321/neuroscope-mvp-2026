"""Encode genuine browser captures, with two explicitly cropped detail views.

Run after capture-product.cjs using the existing backend environment (Pillow).
No generated signals, compositing, UI alterations, or reference artwork.
"""
from pathlib import Path
from PIL import Image

source = Path('work/phase-2b/product')
target = Path('public/product')
target.mkdir(parents=True, exist_ok=True)
for name in ('overview', 'channels', 'zoom', 'inspect', 'timeline'):
    for suffix in ('', '-mobile'):
        with Image.open(source / f'{name}{suffix}.png') as image:
            image.save(target / f'{name}{suffix}.webp', lossless=True, method=6)
for name, original in (('inspect-focus', 'inspect'), ('annotation-focus', 'annotated')):
    with Image.open(source / f'{original}.png') as image:
        image.crop((200, 168, 1168, 722)).save(target / f'{name}.webp', lossless=True, method=6)
with Image.open(source / 'export-detail.png') as image:
    image.save(target / 'export-detail.webp', lossless=True, method=6)
