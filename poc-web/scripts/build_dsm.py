"""由桃園市三維建物（H_BUILD 圖磚，BUILD_H＝建物高）柵格化成數值地表模型（DSM），供視野分析。
地形視為平坦（桃園區高差小）；每格存建物高（公尺，0–255）。

用法：python3 build_dsm.py <tybuild z16 打包圖磚 json> <輸出 png> <輸出 meta json> [格網公尺=4]
"""
import base64, gzip, json, math, sys
import mapbox_vector_tile as mvt
from PIL import Image, ImageDraw

SRC, OUT_PNG, OUT_META = sys.argv[1:4]
CELL_M = float(sys.argv[4]) if len(sys.argv) > 4 else 4.0
d = json.load(open(SRC)); z = d["z"]; n = 2 ** z
keys = [tuple(map(int, k.split("/"))) for k in d["tiles"]]
x0, x1 = min(k[0] for k in keys), max(k[0] for k in keys) + 1
y0, y1 = min(k[1] for k in keys), max(k[1] for k in keys) + 1
lng = lambda tx: tx / n * 360 - 180
lat = lambda ty: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * ty / n))))
W_, E_, N_, S_ = lng(x0), lng(x1), lat(y0), lat(y1)
mid = (N_ + S_) / 2
mx = 111320 * math.cos(math.radians(mid)); my = 110574
W = int(round((E_ - W_) * mx / CELL_M)); H = int(round((N_ - S_) * my / CELL_M))
img = Image.new("L", (W, H), 0)
dr = ImageDraw.Draw(img)
count = 0
# 依高度由低到高畫，重疊處取高者
feats = []
for (tx, ty) in keys:
    raw = base64.b64decode(d["tiles"][f"{tx}/{ty}"])
    if raw[:2] == b"\x1f\x8b": raw = gzip.decompress(raw)
    t = mvt.decode(raw, default_options={"y_coord_down": True})
    for ln, layer in t.items():
        ext = layer.get("extent", 4096)
        for f in layer["features"]:
            h = f["properties"].get("BUILD_H") or 0
            if h <= 0: continue
            g = f["geometry"]
            polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
            for poly in polys:
                ring = poly[0]
                pts = []
                for px, py in ring:
                    lo = lng(tx + px / ext); la = lat(ty + py / ext)
                    pts.append(((lo - W_) / (E_ - W_) * W, (N_ - la) / (N_ - S_) * H))
                if len(pts) >= 3: feats.append((h, pts))
feats.sort(key=lambda f: f[0])
for h, pts in feats:
    dr.polygon(pts, fill=int(max(1, min(255, round(h)))))
    count += 1
img.save(OUT_PNG, optimize=True)
meta = {"bbox": [W_, S_, E_, N_], "width": W, "height": H, "cellM": CELL_M, "buildings": count,
        "source": "桃園市政府地政局 三維建物（H_BUILD，BUILD_H）；地形視為平坦"}
json.dump(meta, open(OUT_META, "w"), ensure_ascii=False)
print(meta)
