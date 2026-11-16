// 日照分析：依日期與時段逐時刻計算太陽方位／高度角，從每個取樣點朝太陽方向沿地表模型（DSM）
// 推進射線，途中有建物高於射線即為遮蔽；累計受照時刻 × 間隔＝日照時數。
// 區域模式：分析範圍內的格網（地面或指定高度）；立面模式：建物外牆每層取樣點。
import { dsmFor, sampleDsm, type Dsm } from './dsm'
import { sunPosition, taipeiTime } from './sun'
import type { LngLat } from '@/types'

export interface Obstacle { ring: LngLat[]; h: number } // 平台上的社區建物（BIM／量體），高度為絕對高程
export interface FacadeTower { tower: string; label: string; ring: LngLat[]; levels: { level: number; z: number }[] }

export interface SunlightInput {
  mode: 'area' | 'facade'
  center: LngLat
  radiusM: number // 區域模式：分析半徑
  heightM: number // 區域模式：分析高度
  date: string // YYYY-MM-DD（臺灣時間）
  start: number // 時（例 8）
  end: number // 時（例 16）
  stepMin: number
  obstacles: Obstacle[]
  facades?: FacadeTower[]
}

export interface SunStep { t: number; azimuth: number; elevation: number }
export interface FacadePoint { pos: [number, number, number]; hours: number; tower: string; level: number; lit: Uint8Array }
export interface FloorStat { tower: string; label: string; level: number; min: number; avg: number; max: number; n: number }

export interface SunlightResult {
  input: SunlightInput
  steps: SunStep[]
  totalHours: number // 時段長度（小時）
  // 區域
  image?: HTMLCanvasElement
  bounds?: [number, number, number, number]
  avgHours?: number
  pctOver: { h: number; pct: number }[]
  shadowFrame?: (i: number) => HTMLCanvasElement // 第 i 個時刻的陰影圖（陰影動畫）
  // 立面
  points?: FacadePoint[]
  floors?: FloorStat[]
  source: string
}

// 色階：0 小時（深藍）→ 最多（紅）
const RAMP: [number, number, number][] = [[49, 54, 149], [69, 117, 180], [116, 173, 209], [171, 217, 233], [254, 224, 144], [253, 174, 97], [244, 109, 67], [215, 48, 39]]
export function hoursColor(h: number, max: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, max ? h / max : 0)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(t))
  const f = t - i
  return RAMP[i].map((c, k) => Math.round(c + (RAMP[i + 1][k] - c) * f)) as [number, number, number]
}
export const RAMP_CSS = `linear-gradient(90deg, ${RAMP.map((c) => `rgb(${c.join(',')})`).join(', ')})`

/** 局部高度格網：DSM（建物高）＋平台社區建物 */
class Grid {
  cell = 2
  w: number
  h: number
  west: number
  north: number
  mx: number
  my: number
  H: Float32Array
  maxH = 0
  constructor(center: LngLat, halfM: number, dsm: Dsm | null, obstacles: Obstacle[]) {
    this.mx = 111320 * Math.cos((center[1] * Math.PI) / 180)
    this.my = 110574
    this.w = this.h = Math.ceil((2 * halfM) / this.cell)
    this.west = center[0] - halfM / this.mx
    this.north = center[1] + halfM / this.my
    this.H = new Float32Array(this.w * this.h)
    if (dsm)
      for (let y = 0; y < this.h; y++) {
        const lat = this.north - ((y + 0.5) * this.cell) / this.my
        for (let x = 0; x < this.w; x++) this.H[y * this.w + x] = sampleDsm(dsm, this.west + ((x + 0.5) * this.cell) / this.mx, lat)
      }
    // 平台社區建物：以 canvas 柵格化後取較高者
    if (obstacles.length) {
      const c = document.createElement('canvas')
      c.width = this.w
      c.height = this.h
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      // 以索引色畫每棟（保留小數高度），重疊處後畫者（較高者）覆蓋
      const byH = [...obstacles].sort((a, b) => a.h - b.h)
      byH.forEach((o, i) => {
        const v = i + 1
        ctx.fillStyle = `rgb(${v & 255},${v >> 8},0)`
        ctx.beginPath()
        o.ring.forEach((p, i) => {
          const [gx, gy] = this.toGrid(p)
          if (i) ctx.lineTo(gx, gy)
          else ctx.moveTo(gx, gy)
        })
        ctx.closePath()
        ctx.fill()
      })
      ctx.imageSmoothingEnabled = false
      const px = ctx.getImageData(0, 0, this.w, this.h).data
      for (let i = 0; i < this.H.length; i++) {
        if (px[i * 4 + 3] < 250) continue // 邊緣反鋸齒像素不計
        const o = byH[px[i * 4] + (px[i * 4 + 1] << 8) - 1]
        if (o) this.H[i] = Math.max(this.H[i], o.h)
      }
    }
    for (let i = 0; i < this.H.length; i++) if (this.H[i] > this.maxH) this.maxH = this.H[i]
  }
  toGrid([lng, lat]: LngLat): [number, number] {
    return [((lng - this.west) * this.mx) / this.cell, ((this.north - lat) * this.my) / this.cell]
  }
  toLngLat(gx: number, gy: number): LngLat {
    return [this.west + (gx * this.cell) / this.mx, this.north - (gy * this.cell) / this.my]
  }
  at(gx: number, gy: number) {
    const x = Math.floor(gx)
    const y = Math.floor(gy)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1
    return this.H[y * this.w + x]
  }
  /** 從 (gx, gy, z) 朝太陽是否受照：每半格（1 公尺）取樣一次，rise 為每格上升高度 */
  lit(gx: number, gy: number, z: number, dx: number, dy: number, rise: number, ds = 0.5) {
    for (let s = ds; ; s += ds) {
      const rz = z + s * rise
      if (rz > this.maxH) return true
      const h = this.at(gx + dx * s, gy + dy * s)
      if (h < 0) return true
      if (h > rz) return false
    }
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

export async function computeSunlight(input: SunlightInput): Promise<SunlightResult> {
  const { center, date, start, end, stepMin } = input
  const dsm = await dsmFor(center)
  // 時刻：每個間隔取中點；只計太陽在地平線上
  const steps: SunStep[] = []
  const n = Math.max(1, Math.round(((end - start) * 60) / stepMin))
  for (let k = 0; k < n; k++) {
    const t = start + ((k + 0.5) * stepMin) / 60
    const p = sunPosition(taipeiTime(date, t), center[1], center[0])
    steps.push({ t, ...p })
  }
  const stepH = stepMin / 60
  const totalHours = n * stepH
  const dirs = steps.map((s) => {
    const a = (s.azimuth * Math.PI) / 180
    const e = (s.elevation * Math.PI) / 180
    return { up: s.elevation > 0.5, dx: Math.sin(a), dy: -Math.cos(a), tanE: Math.tan(e) }
  })
  const source = dsm ? `${dsm.source}＋平台社區建物模型` : '平台社區建物模型（此區無地政局三維建物）'

  if (input.mode === 'facade') {
    const facades = input.facades ?? []
    const half = 420
    const grid = new Grid(center, half, dsm, input.obstacles)
    const points: FacadePoint[] = []
    const floors: FloorStat[] = []
    for (const f of facades) {
      // 外牆取樣點：沿輪廓每 3 公尺、往外推 1.5 公尺（避開牆面柵格化誤差）
      const ring = f.ring.map((p) => grid.toGrid(p))
      const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length
      const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length
      const samples: [number, number][] = []
      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, ay] = ring[i]
        const [bx, by] = ring[i + 1]
        const len = Math.hypot(bx - ax, by - ay) * grid.cell
        if (len < 0.5) continue
        let nx = (by - ay) / Math.hypot(bx - ax, by - ay)
        let ny = -(bx - ax) / Math.hypot(bx - ax, by - ay)
        const mxp = (ax + bx) / 2 - cx
        const myp = (ay + by) / 2 - cy
        if (nx * mxp + ny * myp < 0) { nx = -nx; ny = -ny }
        const k = Math.max(1, Math.round(len / 3))
        for (let j = 0; j < k; j++) {
          const t = (j + 0.5) / k
          samples.push([ax + (bx - ax) * t + (nx * 1.5) / grid.cell, ay + (by - ay) * t + (ny * 1.5) / grid.cell])
        }
      }
      for (const lv of f.levels) {
        let sum = 0, mn = Infinity, mx = 0
        for (const [gx, gy] of samples) {
          let lit = 0
          const mask = new Uint8Array(dirs.length)
          dirs.forEach((d, k) => {
            if (d.up && grid.lit(gx, gy, lv.z, d.dx, d.dy, d.tanE * grid.cell, 0.25)) { lit++; mask[k] = 1 }
          })
          const hours = lit * stepH
          const [lng, lat] = grid.toLngLat(gx, gy)
          points.push({ pos: [lng, lat, lv.z], hours, tower: f.tower, level: lv.level, lit: mask })
          sum += hours
          mn = Math.min(mn, hours)
          mx = Math.max(mx, hours)
        }
        floors.push({ tower: f.tower, label: f.label, level: lv.level, min: samples.length ? mn : 0, avg: samples.length ? sum / samples.length : 0, max: mx, n: samples.length })
        await tick()
      }
    }
    const allH = points.map((p) => p.hours)
    return {
      input, steps, totalHours, points, floors, source,
      avgHours: allH.length ? allH.reduce((a, b) => a + b, 0) / allH.length : 0,
      pctOver: [1, 2, 3].map((h) => ({ h, pct: allH.length ? allH.filter((x) => x >= h).length / allH.length : 0 })),
    }
  }

  // 區域模式
  const R = input.radiusM
  const grid = new Grid(center, R + 320, dsm, input.obstacles)
  const z0 = input.heightM
  const res = 4 // 區域取樣解析度（公尺）
  const size = Math.round((2 * R) / res)
  const [cgx, cgy] = grid.toGrid(center)
  const hours = new Float32Array(size * size).fill(-1)
  const shadow: Uint8Array[] = steps.map(() => new Uint8Array(size * size)) // 1＝陰影、2＝建物內
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ox = (x + 0.5) * res - R
      const oy = (y + 0.5) * res - R
      if (Math.hypot(ox, oy) > R) continue
      const gx = cgx + ox / grid.cell
      const gy = cgy + oy / grid.cell
      const i = y * size + x
      if (grid.at(gx, gy) > z0) {
        shadow.forEach((m) => (m[i] = 2))
        continue
      }
      let lit = 0
      dirs.forEach((d, k) => {
        if (d.up && grid.lit(gx, gy, z0, d.dx, d.dy, d.tanE * grid.cell)) lit++
        else shadow[k][i] = 1
      })
      hours[i] = lit * stepH
    }
    if (y % 16 === 0) await tick()
  }
  const img = new ImageData(size, size)
  let sum = 0, cnt = 0
  const over = [1, 2, 3].map(() => 0)
  for (let i = 0; i < hours.length; i++) {
    const h = hours[i]
    if (h < 0) continue
    const [r, g, b] = hoursColor(h, totalHours)
    img.data.set([r, g, b, 170], i * 4)
    sum += h
    cnt++
    ;[1, 2, 3].forEach((t, k) => h >= t && over[k]++)
  }
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.getContext('2d')!.putImageData(img, 0, 0)
  const sw = grid.toLngLat(cgx - R / grid.cell, cgy + R / grid.cell)
  const ne = grid.toLngLat(cgx + R / grid.cell, cgy - R / grid.cell)
  const frames = new Map<number, HTMLCanvasElement>()
  const shadowFrame = (k: number) => {
    if (!frames.has(k)) {
      const im = new ImageData(size, size)
      const m = shadow[k]
      for (let i = 0; i < m.length; i++) {
        if (hours[i] < 0 && m[i] !== 2) continue
        if (m[i] === 1) im.data.set([30, 41, 59, 150], i * 4)
        else if (m[i] === 0) im.data.set([253, 224, 71, 70], i * 4)
      }
      const c = document.createElement('canvas')
      c.width = c.height = size
      c.getContext('2d')!.putImageData(im, 0, 0)
      frames.set(k, c)
    }
    return frames.get(k)!
  }
  return {
    input, steps, totalHours, source,
    image: canvas,
    bounds: [sw[0], sw[1], ne[0], ne[1]],
    avgHours: cnt ? sum / cnt : 0,
    pctOver: [1, 2, 3].map((h, k) => ({ h, pct: cnt ? over[k] / cnt : 0 })),
    shadowFrame,
  }
}
