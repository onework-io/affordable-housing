// 動態公車（模擬）：依路線行駛軌跡（scripts/build_bus_stops.py 產生）讓公車來回行駛。
// 非即時位置；正式版改接 TDX／市府公車動態 API（A1/A2 即時定位）即可替換 positions()。
import { PathLayer } from '@deck.gl/layers'
import type { Layer } from '@deck.gl/core'
import { SimpleMeshLayer } from '@deck.gl/mesh-layers'
import { CubeGeometry } from '@luma.gl/engine'
import type { LngLat } from '@/types'

export interface SimRoute { code: string; from: string; to: string; km: number; stops: number; path: LngLat[] }
export interface Bus {
  id: string
  route: SimRoute
  color: [number, number, number]
  path: LngLat[] // 去程＋返程
  ts: number[] // 各點抵達秒數
  period: number
  offset: number
}
export interface BusState { bus: Bus; pos: LngLat; heading: number; trail: LngLat[] }

const SPEED = 25 / 3.6 // 公尺／秒（市區公車平均約 25 km/h）
const PALETTE: [number, number, number][] = [
  [37, 99, 235], [234, 88, 12], [22, 163, 74], [219, 39, 119], [124, 58, 237],
  [8, 145, 178], [202, 138, 4], [220, 38, 38], [13, 148, 136], [79, 70, 229],
]
const M_PER_DEG_LAT = 110574
const mx = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180)
function dist(a: LngLat, b: LngLat) {
  const dx = (b[0] - a[0]) * mx((a[1] + b[1]) / 2)
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT
  return Math.hypot(dx, dy)
}
function hash(s: string) {
  let h = 7
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

let loaded: Promise<Bus[]> | null = null
/** 路線資料另成一個檔案，開啟動態公車時才載入 */
export function loadBuses(): Promise<Bus[]> {
  loaded ??= import('@/data/bus-routes.json').then((m) => {
    const routes = (m.default as unknown as { routes: SimRoute[] }).routes
    const buses: Bus[] = []
    for (const r of routes) {
      const path = [...r.path, ...r.path.slice(0, -1).reverse()] as LngLat[]
      const ts = [0]
      for (let i = 1; i < path.length; i++) ts.push(ts[i - 1] + dist(path[i - 1], path[i]) / SPEED)
      const period = ts[ts.length - 1]
      const color = PALETTE[hash(r.code) % PALETTE.length]
      const n = r.km > 4 ? 3 : 2 // 長路線多派一班
      for (let k = 0; k < n; k++) buses.push({ id: `${r.code}-${k}`, route: r, color, path, ts, period, offset: (period * k) / n + (hash(r.code) % 97) })
    }
    return buses
  })
  return loaded
}

const TRAIL_SEC = 75

function locate(bus: Bus, tt: number) {
  let lo = 0
  let hi = bus.ts.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (bus.ts[mid] <= tt) lo = mid
    else hi = mid
  }
  const a = bus.path[lo]
  const b = bus.path[hi]
  const f = bus.ts[hi] > bus.ts[lo] ? (tt - bus.ts[lo]) / (bus.ts[hi] - bus.ts[lo]) : 0
  return { lo, hi, a, b, pos: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as LngLat }
}

export function positions(buses: Bus[], t: number): BusState[] {
  return buses.map((bus) => {
    const tt = (t + bus.offset) % bus.period
    const cur = locate(bus, tt)
    const heading = (Math.atan2((cur.b[0] - cur.a[0]) * mx(cur.a[1]), (cur.b[1] - cur.a[1]) * M_PER_DEG_LAT) * 180) / Math.PI // 0＝北，順時針
    // 尾跡：最近 TRAIL_SEC 秒走過的路
    const t0 = Math.max(0, tt - TRAIL_SEC)
    const start = locate(bus, t0)
    const trail: LngLat[] = [start.pos]
    for (let i = start.hi; i <= cur.lo; i++) trail.push(bus.path[i])
    trail.push(cur.pos)
    return { bus, pos: cur.pos, heading, trail }
  })
}

const cube = new CubeGeometry()

/** zoom 越遠車身放大越多，遠景也看得到 */
export function busLayers(buses: Bus[], t: number, zoom: number, highlight: string | null): Layer[] {
  const st = positions(buses, t)
  const k = Math.min(6, Math.max(1.5, 2 ** (18 - zoom)))
  const common = {
    data: st,
    mesh: cube,
    getPosition: (d: BusState) => d.pos,
    getOrientation: (d: BusState) => [0, -d.heading, 0] as [number, number, number],
    sizeScale: k,
    pickable: true,
  }
  const out: Layer[] = []
  if (highlight) {
    const r = buses.find((b) => b.route.code === highlight)?.route
    if (r)
      out.push(
        new PathLayer<SimRoute>({
          id: 'bus-route-highlight',
          data: [r],
          getPath: (d) => d.path,
          getColor: [...(buses.find((b) => b.route.code === highlight)!.color), 230],
          getWidth: 6,
          widthUnits: 'pixels',
          capRounded: true,
          jointRounded: true,
          parameters: { depthCompare: 'always' },
        }),
      )
  }
  out.push(
    new PathLayer<BusState>({
      id: 'bus-trails',
      data: st,
      getPath: (d) => d.trail,
      getColor: (d) => [...d.bus.color, highlight && d.bus.route.code !== highlight ? 40 : 150] as [number, number, number, number],
      getWidth: 4,
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      parameters: { depthCompare: 'always' },
      updateTriggers: { getColor: highlight },
    }),
    // 車身（路線色）
    new SimpleMeshLayer<BusState>({
      id: 'bus-3d-body',
      ...common,
      getColor: (d) => (highlight && d.bus.route.code !== highlight ? [...d.bus.color, 90] : [...d.bus.color, 255]) as [number, number, number, number],
      getScale: [1.25, 5.8, 1.35],
      getTranslation: [0, 0, 1.75],
      updateTriggers: { getColor: highlight },
    }),
    // 車窗帶
    new SimpleMeshLayer<BusState>({
      id: 'bus-3d-window',
      ...common,
      getColor: [30, 41, 59, 235],
      getScale: [1.28, 5.2, 0.45],
      getTranslation: [0, 0, 2.2],
    }),
    // 白色車頂
    new SimpleMeshLayer<BusState>({
      id: 'bus-3d-roof',
      ...common,
      getColor: [248, 250, 252, 255],
      getScale: [1.2, 5.6, 0.12],
      getTranslation: [0, 0, 3.2],
    }),
  )
  return out
}
