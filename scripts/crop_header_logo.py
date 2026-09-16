from PIL import Image, ImageChops

source = Image.open("client/public/swans-travel-logo.png").convert("RGBA")
background = Image.new("RGBA", source.size, (255, 255, 255, 255))
diff = ImageChops.difference(source, background).convert("L")
# Keep a small margin around all non-white logo pixels.
bbox = diff.point(lambda value: 255 if value > 8 else 0).getbbox()
if bbox is None:
    raise RuntimeError("Logo artwork could not be detected")
left, top, right, bottom = bbox
padding_x = 18
padding_y = 12
left = max(0, left - padding_x)
top = max(0, top - padding_y)
right = min(source.width, right + padding_x)
bottom = min(source.height, bottom + padding_y)
source.crop((left, top, right, bottom)).save("client/public/swans-travel-logo-header.png", optimize=True)
print(f"Cropped logo from {source.size} to {(right-left, bottom-top)}")
print(f"Bounds: {(left, top, right, bottom)}")
