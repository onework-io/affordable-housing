// 日照分析用的周邊建物：由桃園市地政局三維建物圖磚（H_BUILD，z16 打包圖磚）解出平面輪廓與高度
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { bundle } from '@/utils/packedTiles'
import type { LngLat } from '@/types'

export interface Footprint { id: string; ring: LngLat[]; h: number }

const Z = 16
const N = 2 ** Z
const tx = (lng: number) => Math.floor(((lng + 180) / 360) * N)
const ty = (lat: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N)
}

function decode(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const tileCache = new Map<string, Footprint[]>()

async function gunzipIfNeeded(u8: Uint8Array): Promise<Uint8Array> {
  if (u8[0] !== 0x1f || u8[1] !== 0x8b) return u8
  const s = new Blob([u8 as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(s).arrayBuffer())
}

/** 取 bbox（經緯度）範圍內的建物輪廓；跨圖磚的建物以輪廓去重 */
export async function footprintsIn(west: number, south: number, east: number, north: number): Promise<Footprint[]> {
  const tiles = await bundle('tybuild', String(Z))
  if (!tiles) return []
  const out: Footprint[] = []
  for (let x = tx(west); x <= tx(east); x++)
    for (let y = ty(north); y <= ty(south); y++) {
      const key = `${x}/${y}`
      if (!tileCache.has(key)) {
        const list: Footprint[] = []
        const b64 = tiles[key]
        if (b64) {
          const vt = new VectorTile(new Pbf(await gunzipIfNeeded(decode(b64))))
          const layer = vt.layers.H_BUILD ?? Object.values(vt.layers)[0]
          for (let i = 0; layer && i < layer.length; i++) {
            const f = layer.feature(i)
            const h = Number(f.properties.BUILD_H) || 0
            if (h <= 0) continue
            const g = f.toGeoJSON(x, y, Z).geometry
            const polys: LngLat[][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
            // 圖磚含緩衝區：只留中心點落在本圖磚內的（跨圖磚的建物兩半各自保留）
            polys.forEach((p, k) => {
              const r = p[0]
              if (!r || r.length < 4) return
              const cx = r.reduce((a, q) => a + q[0], 0) / r.length
              const cy = r.reduce((a, q) => a + q[1], 0) / r.length
              if (tx(cx) !== x || ty(cy) !== y) return
              list.push({ id: `${key}:${i}:${k}`, ring: r, h })
            })
          }
        }
        tileCache.set(key, list)
      }
      for (const f of tileCache.get(key)!) {
        const [lng, lat] = f.ring[0]
        if (lng < west - 0.002 || lng > east + 0.002 || lat < south - 0.002 || lat > north + 0.002) continue
        out.push(f)
      }
    }
  return out
}

export function pointInRing([x, y]: LngLat, ring: LngLat[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
