"""Encode genuine browser captures, with explicitly cropped detail views.

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
            # Keep the original axes, inspector and timeline together. Only remove
            # surrounding chrome; never resample signals or composite screenshots.
            bounds = (0, 238, 368, 1040) if suffix else (200, 168, 1168, 893)
            image.crop(bounds).save(target / f'{name}-detail{suffix}.webp', lossless=True, method=6)
for name, original in (('inspect-focus', 'inspect'), ('annotation-focus', 'annotated')):
    with Image.open(source / f'{original}.png') as image:
        image.crop((200, 168, 1168, 722)).save(target / f'{name}.webp', lossless=True, method=6)
with Image.open(source / 'export-detail.png') as image:
    image.save(target / 'export-detail.webp', lossless=True, method=6)

# A contiguous C3 / P3 excerpt from the same five-second capture for the use-case card.
with Image.open(source / 'zoom.png') as image:
    image.crop((200, 337, 1168, 483)).save(target / 'study-detail.webp', lossless=True, method=6)
