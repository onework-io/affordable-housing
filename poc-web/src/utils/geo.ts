// 地理計算工具（沿用 TaiwanWarRoom03 src/utils/geo.ts 的 haversine / circlePolygon，改為公尺級精度）
import type { LngLat } from '@/types'

const R = 6371.0088 // km
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

/** Haversine 距離（km） */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** 由中心點、方位角、距離推算目的點（球面公式） */
export function destination(c: LngLat, bearingDeg: number, km: number): LngLat {
  const d = km / R
  const brg = toRad(bearingDeg)
  const lat1 = toRad(c[1])
  const lon1 = toRad(c[0])
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg))
  const lon2 = lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [toDeg(lon2), toDeg(lat2)]
}

/** 圓形多邊形（km 半徑），供生活圈繪製 */
export function circlePolygon(center: LngLat, radiusKm: number, steps = 96): LngLat[] {
  const ring: LngLat[] = []
  for (let i = 0; i <= steps; i++) ring.push(destination(center, (i / steps) * 360, radiusKm))
  return ring
}

/** 以中心點為原點、公尺為單位的矩形 footprint */
export function rectFootprint(center: LngLat, widthM: number, depthM: number, rotDeg = 0): LngLat[] {
  const pts: [number, number][] = [[-widthM / 2, -depthM / 2], [widthM / 2, -depthM / 2], [widthM / 2, depthM / 2], [-widthM / 2, depthM / 2]]
  const rot = toRad(rotDeg)
  const ring = pts.map(([x, y]) => {
    const rx = x * Math.cos(rot) - y * Math.sin(rot)
    const ry = x * Math.sin(rot) + y * Math.cos(rot)
    const dist = Math.hypot(rx, ry) / 1000
    const brg = (toDeg(Math.atan2(rx, ry)) + 360) % 360
    return destination(center, brg, dist)
  })
  return [...ring, ring[0]]
}

/** 取得包住圓的 bounds：[[w,s],[e,n]] */
export function circleBounds(center: LngLat, radiusKm: number): [LngLat, LngLat] {
  const n = destination(center, 0, radiusKm)[1]
  const s = destination(center, 180, radiusKm)[1]
  const e = destination(center, 90, radiusKm)[0]
  const w = destination(center, 270, radiusKm)[0]
  return [[w, s], [e, n]]
}

export const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} 公尺` : `${km.toFixed(1)} 公里`)

/** 中心點半徑內的公車站牌數、經過路線數與最近距離 */
export function busStats(center: LngLat, radiusKm: number, stops: { lngLat: LngLat; routes: { code: string }[] }[]) {
  let n = 0
  let nearest = Infinity
  const routes = new Set<string>()
  for (const s of stops) {
    const d = haversine(center, s.lngLat)
    if (d > radiusKm) continue
    n++
    nearest = Math.min(nearest, d)
    for (const r of s.routes) routes.add(r.code)
  }
  return { stops: n, routes: routes.size, nearestKm: Number.isFinite(nearest) ? nearest : null }
}
