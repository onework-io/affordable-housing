// 打包圖磚的範圍規劃（Node 腳本與瀏覽器下載共用）
// 由外而內：低縮放涵蓋桃園北區，高縮放只涵蓋桃園區示範社區周邊，控制檔案大小。
export const TILE_PLAN = {
  emap: {
    url: 'https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}',
    ext: 'jpg',
    zooms: { 10: 'region', 11: 'region', 12: 'region', 13: 'region', 14: 'city', 15: 'district', 16: 'site', 17: 'core' },
  },
  photo: {
    url: 'https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}',
    ext: 'jpg',
    zooms: { 10: 'region', 11: 'region', 12: 'region', 13: 'region', 14: 'city', 15: 'district', 16: 'site' },
  },
}

// [西, 南, 東, 北]
export const BBOX = {
  region: [121.05, 24.9, 121.45, 25.18],
  city: [121.24, 24.94, 121.36, 25.03],
  district: [121.27, 24.96, 121.34, 25.02],
  site: [121.28, 24.975, 121.32, 25.01],
  core: [121.29, 24.985, 121.31, 25.0],
}

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z)
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/** 列出某圖層某縮放需要的圖磚 [x, y] */
export function tilesFor(layer, z) {
  const [w, s, e, n] = BBOX[TILE_PLAN[layer].zooms[z]]
  const out = []
  for (let x = lon2x(w, z); x <= lon2x(e, z); x++) for (let y = lat2y(n, z); y <= lat2y(s, z); y++) out.push([x, y])
  return out
}

export const tileUrl = (layer, z, x, y) => TILE_PLAN[layer].url.replace('{z}', z).replace('{x}', x).replace('{y}', y)
