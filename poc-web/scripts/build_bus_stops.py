"""產生公車站牌資料：站牌位置取自 OpenStreetMap（打包的 OpenFreeMap 圖磚），
經過路線取自 mattlin4567/Taoyuan-bus-opendata（桃園市公車動態資訊系統，2017）。

另依 OSM 道路（transportation 圖層）建立路網，以最短路徑串起各路線的站牌，輸出模擬行駛軌跡。

用法：python3 build_bus_stops.py <osm z14 打包圖磚 json> <taoyuan_stopOfRoute.json> <站牌輸出 json> <路線軌跡輸出 json>
"""
import base64, gzip, json, math, re, sys
import mapbox_vector_tile as mvt
import networkx as nx

TILES, ROUTES, OUT, OUT_ROUTES = sys.argv[1:5]
ROAD_CLASSES = {"motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"}
BBOX = (121.27, 24.96, 121.34, 25.02)  # 桃園區展示範圍（與 tile-plan district 相同）
MERGE_M = 120          # 同名站牌 120 公尺內合併（去返程兩側）
NEIGHBOR_KM = 2.0      # 路線比對：前後站也要在 2 公里內找得到，才算同一條路線經過

def hav(a, b):
    R = 6371.0; p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp = p2 - p1; dl = math.radians(b[0] - a[0])
    return 2 * R * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))

def norm(s):
    s = re.sub(r"[（(].*?[)）]", "", s or "")
    s = s.replace("臺", "台").replace(" ", "").strip()
    return s

# 1. OSM 公車站牌
d = json.load(open(TILES))
z = d["z"]; n = 2 ** z
pts = []
G = nx.Graph()
# 圖磚切邊、簡化後同一路口的頂點會略為錯開：4 公尺內的頂點合併成同一節點
SNAP = {}
CELL = 4e-5  # 約 4 公尺
def nodekey(ll):
    gx, gy = int(ll[0] / CELL), int(ll[1] / CELL)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for cand in SNAP.get((gx + dx, gy + dy), ()):
                if abs(cand[0] - ll[0]) < CELL and abs(cand[1] - ll[1]) < CELL: return cand
    key = (round(ll[0], 6), round(ll[1], 6))
    SNAP.setdefault((gx, gy), []).append(key)
    return key
for key, b64 in d["tiles"].items():
    x, y = map(int, key.split("/"))
    raw = base64.b64decode(b64)
    if raw[:2] == b"\x1f\x8b": raw = gzip.decompress(raw)
    t = mvt.decode(raw, default_options={"y_coord_down": True})
    def tolnglat(gx, gy, ext):
        lng = (x + gx / ext) / n * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + gy / ext) / n))))
        return (lng, lat)
    tr = t.get("transportation")
    if tr:
        ext_t = tr.get("extent", 4096)
        for f in tr["features"]:
            if f["properties"].get("class") not in ROAD_CLASSES: continue
            if f["properties"].get("brunnel") == "tunnel": continue
            geom = f["geometry"]
            lines = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"] if geom["type"] == "MultiLineString" else []
            for line in lines:
                ll = [nodekey(tolnglat(px, py, ext_t)) for px, py in line]
                for a, b in zip(ll, ll[1:]):
                    if a != b: G.add_edge(a, b, w=hav(a, b))
    layer = t.get("poi")
    if not layer: continue
    ext = layer.get("extent", 4096)
    for f in layer["features"]:
        p = f["properties"]
        if not (p.get("class") == "bus" or p.get("subclass") in ("bus_stop", "bus_station")): continue
        name = p.get("name:zh") or p.get("name") or ""
        if not name: continue
        gx, gy = f["geometry"]["coordinates"]
        lng = (x + gx / ext) / n * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + gy / ext) / n))))
        if BBOX[0] <= lng <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]:
            pts.append((name, (lng, lat)))

# 2. 同名就近合併
stops = []
for name, ll in pts:
    for s in stops:
        if s["name"] == name and hav(s["_c"], ll) * 1000 <= MERGE_M:
            s["_pts"].append(ll); s["_c"] = (sum(p[0] for p in s["_pts"]) / len(s["_pts"]), sum(p[1] for p in s["_pts"]) / len(s["_pts"]))
            break
    else:
        stops.append({"name": name, "_pts": [ll], "_c": ll})
byname = {}
for s in stops: byname.setdefault(norm(s["name"]), []).append(s)

# 3. 路線比對（名稱相同，且前後站也在附近，避免不同區同名站牌誤配）
routes = json.load(open(ROUTES))
route_info = {}
for r in routes:
    for dirn in ("goRoute", "backRoute"):
        seq = r.get(dirn) or []
        if not seq: continue
        info = route_info.setdefault(r["id"], {"code": r["id"], "from": seq[0]["zh"], "to": seq[-1]["zh"]})
        cand = [byname.get(norm(s["zh"]), []) for s in seq]
        ordered = []
        for i, cs in enumerate(cand):
            best = None
            for c in cs:
                ok = False
                for j in (i - 2, i - 1, i + 1, i + 2):
                    if 0 <= j < len(cand) and any(hav(c["_c"], o["_c"]) <= NEIGHBOR_KM for o in cand[j] if o is not c):
                        ok = True; break
                if ok:
                    c.setdefault("_routes", set()).add(r["id"])
                    if best is None or (ordered and hav(c["_c"], ordered[-1]["_c"]) < hav(best["_c"], ordered[-1]["_c"])): best = c
            if best is not None and (not ordered or ordered[-1] is not best): ordered.append(best)
        if dirn == "goRoute": info["_seq"] = ordered

out = []
for i, s in enumerate(sorted(stops, key=lambda s: (s["_c"][1], s["_c"][0]))):
    rs = sorted(s.get("_routes", set()), key=lambda c: (len(c), c))
    out.append({
        "id": f"B{i + 1:04d}",
        "name": s["name"],
        "lngLat": [round(s["_c"][0], 6), round(s["_c"][1], 6)],
        "routes": [{k: v for k, v in route_info[c].items() if not k.startswith("_")} for c in rs],
    })
meta = {
    "source": {
        "stops": "© OpenStreetMap 貢獻者（ODbL），經 OpenFreeMap 向量圖磚",
        "routes": "mattlin4567/Taoyuan-bus-opendata（MIT；原始資料：桃園市公車動態資訊系統，2017-04）",
    },
    "bbox": BBOX,
    "count": len(out),
    "withRoutes": sum(1 for s in out if s["routes"]),
}
json.dump({"meta": meta, "stops": out}, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print(json.dumps(meta, ensure_ascii=False))

# 4. 路線行駛軌跡：相鄰站牌之間走路網最短路徑（找不到或繞太遠就直線連接）
# 只用最大連通路網，避免站牌吸附到孤立的小路段
G = G.subgraph(max(nx.connected_components(G), key=len)).copy()
nodes = list(G.nodes)
grid = {}
for nd in nodes: grid.setdefault((int(nd[0] * 500), int(nd[1] * 500)), []).append(nd)
def nearest(ll):
    gx, gy = int(ll[0] * 500), int(ll[1] * 500)
    best, bd = None, 1e9
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for nd in grid.get((gx + dx, gy + dy), []):
                dd = hav(ll, nd)
                if dd < bd: best, bd = nd, dd
    return best if bd < 0.25 else None
out_routes = []
STAT = {'road': 0, 'straight': 0}
for code, info in route_info.items():
    seq = info.get("_seq") or []
    if len(seq) < 4: continue
    path = [seq[0]["_c"]]
    for a, b in zip(seq, seq[1:]):
        na, nb = nearest(a["_c"]), nearest(b["_c"])
        seg = None
        if na and nb and na != nb:
            try:
                p = nx.shortest_path(G, na, nb, weight="w")
                L = sum(hav(p[i], p[i + 1]) for i in range(len(p) - 1))
                if L <= hav(a["_c"], b["_c"]) * 3 + 0.5: seg = p
            except nx.NetworkXNoPath:
                pass
        STAT['road' if seg else 'straight'] += 1
        path += (seg or []) + [b["_c"]]
    # 去除重複點
    clean = [path[0]]
    for p in path[1:]:
        if hav(p, clean[-1]) > 0.003: clean.append(p)
    length = sum(hav(clean[i], clean[i + 1]) for i in range(len(clean) - 1))
    if length < 0.8: continue
    out_routes.append({"code": code, "from": info["from"], "to": info["to"], "km": round(length, 2), "stops": len(seq),
                       "path": [[round(p[0], 6), round(p[1], 6)] for p in clean]})
json.dump({"meta": {"note": "模擬行駛軌跡：站牌依路線順序以 OSM 路網最短路徑串接，非即時公車位置", "routes": len(out_routes)}, "routes": out_routes},
          open(OUT_ROUTES, "w"), ensure_ascii=False, separators=(",", ":"))
print("routes", len(out_routes), "graph", G.number_of_nodes(), G.number_of_edges(), "components", nx.number_connected_components(G), "largest", len(max(nx.connected_components(G), key=len)), STAT)
