"""產生 app 圖示（衣架）。用法：python3 tools/make-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'icons'
BG = (200, 100, 59)
FG = (255, 248, 240)


def draw(size):
    s = 4  # 先畫大張再縮小，邊緣比較平滑
    n = size * s
    img = Image.new('RGB', (n, n), BG)
    d = ImageDraw.Draw(img)
    w = round(n * 0.045)
    cx = n / 2
    # 鉤子
    r = n * 0.075
    d.arc([cx - r, n * 0.22, cx + r, n * 0.22 + 2 * r], start=180, end=90, fill=FG, width=w)
    d.line([cx, n * 0.22 + 2 * r, cx, n * 0.42], fill=FG, width=w)
    # 三角形衣架
    left, right, bottom = n * 0.18, n * 0.82, n * 0.68
    d.line([cx, n * 0.42, left, bottom], fill=FG, width=w, joint='curve')
    d.line([cx, n * 0.42, right, bottom], fill=FG, width=w, joint='curve')
    d.line([left, bottom, right, bottom], fill=FG, width=w)
    for x, y in [(left, bottom), (right, bottom), (cx, n * 0.42)]:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=FG)
    return img.resize((size, size), Image.LANCZOS)


for size in (180, 192, 512):
    draw(size).save(OUT / f'icon-{size}.png', optimize=True)
