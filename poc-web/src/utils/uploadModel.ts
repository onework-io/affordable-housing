// 上傳 GLB 的定位換算：模型局部座標 → 東北上（ENU，公尺）→ 經緯度
import type { LngLat, ModelPlacement } from '@/types'

type V3 = [number, number, number]
export type Bounds = [number, number, number, number, number, number]

export const UNITS = [
  { label: '公尺（m）', value: 1 },
  { label: '公分（cm）', value: 0.01 },
  { label: '公釐（mm）', value: 0.001 },
  { label: '英尺（ft）', value: 0.3048 },
] as const

/** 模型局部座標 → ENU（尚未縮放、旋轉）。Y 上：(x, -z, y)；Z 上：(x, y, z) */
export const toEnu = (v: V3, up: 'Y' | 'Z'): V3 => (up === 'Y' ? [v[0], -v[2], v[1]] : [v[0], v[1], v[2]])

/** 平面順時針旋轉（角度） */
export function rotCW(e: number, n: number, deg: number): [number, number] {
  const t = (deg * Math.PI) / 180
  return [e * Math.cos(t) + n * Math.sin(t), -e * Math.sin(t) + n * Math.cos(t)]
}

/** 依上軸取底面中心（局部座標） */
export function bottomCenter(b: Bounds, up: 'Y' | 'Z'): V3 {
  return up === 'Y' ? [(b[0] + b[3]) / 2, b[1], (b[2] + b[5]) / 2] : [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, b[2]]
}

/** 尺寸（公尺）：寬（東西）× 深（南北）× 高 */
export function sizeOf(b: Bounds, up: 'Y' | 'Z', scale: number): V3 {
  const dx = b[3] - b[0], dy = b[4] - b[1], dz = b[5] - b[2]
  const s = up === 'Y' ? [dx, dz, dy] : [dx, dy, dz]
  return s.map((v) => +(v * scale).toFixed(2)) as V3
}

const offsetLngLat = ([lng, lat]: LngLat, e: number, n: number): LngLat => [lng + e / (111320 * Math.cos((lat * Math.PI) / 180)), lat + n / 110574]

/** deck.gl ScenegraphLayer 參數與平面輪廓 */
export function uploadPlacement(m: ModelPlacement) {
  const up = m.upAxis ?? 'Y'
  const s = m.scale ?? 1
  const b = m.bounds ?? [0, 0, 0, 0, 0, 0]
  const c = m.center ?? [0, 0, 0]
  const [ce, cn, cu] = toEnu(c, up)
  const [re, rn] = rotCW(ce * s, cn * s, m.yaw)
  const translation: V3 = [-re, -rn, -cu * s]
  // 包圍盒底面四角 → 經緯度
  const lo = toEnu([b[0], b[1], b[2]], up)
  const hi = toEnu([b[3], b[4], b[5]], up)
  const [e0, e1] = [Math.min(lo[0], hi[0]), Math.max(lo[0], hi[0])]
  const [n0, n1] = [Math.min(lo[1], hi[1]), Math.max(lo[1], hi[1])]
  const [u0, u1] = [Math.min(lo[2], hi[2]), Math.max(lo[2], hi[2])]
  const ring = ([[e0, n0], [e1, n0], [e1, n1], [e0, n1], [e0, n0]] as [number, number][]).map(([e, n]) => {
    const [x, y] = rotCW((e - ce) * s, (n - cn) * s, m.yaw)
    return offsetLngLat(m.anchor, x, y)
  })
  return {
    orientation: [0, -m.yaw, up === 'Y' ? 90 : 0] as V3,
    translation,
    footprint: ring,
    baseZ: m.altitude + (u0 - cu) * s,
    height: (u1 - u0) * s,
  }
}
