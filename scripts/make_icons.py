from pathlib import Path
from PIL import Image, ImageDraw

target = Path(__file__).resolve().parents[1] / 'public'
target.mkdir(exist_ok=True)
for size in (192, 512):
    image = Image.new('RGB', (size, size), '#f7f4ec')
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((size*.12, size*.12, size*.88, size*.88), radius=int(size*.2), fill='#16875d')
    draw.rounded_rectangle((size*.44, size*.3, size*.56, size*.7), radius=int(size*.03), fill='white')
    draw.rounded_rectangle((size*.3, size*.44, size*.7, size*.56), radius=int(size*.03), fill='white')
    image.save(target / f'icon-{size}.png')
