import sys
from PIL import Image, ImageDraw
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
scale = min(1.0, 1900 / (cols * w))
tw, th = int(w * scale), int(h * scale)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (tw * cols, th * rows), (32, 32, 32))
d = ImageDraw.Draw(sheet)
for i, im in enumerate(ims):
    im = im.resize((tw, th), Image.LANCZOS)
    sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
    d.text(((i % cols) * tw + 8, (i // cols) * th + 6), files[i].split('_')[-1][:-4], fill=(255, 0, 0))
sheet.save(out)
