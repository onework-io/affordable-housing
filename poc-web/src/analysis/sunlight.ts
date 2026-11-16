// 日照分析：依日期與時段逐時刻計算太陽方位／高度角，從每個取樣點朝太陽方向沿地表模型（DSM）
// 推進射線，途中有建物高於射線即為遮蔽；累計受照時刻 × 間隔＝日照時數。
// 範圍模式（仿 SuperMap 日照分析）：分析半徑內所有建物的外牆、屋頂與地面都切成網格逐格計算並上色；
// 區域模式：只算地面（或指定高度）的格網。
import { dsmFor, sampleDsm, type Dsm } from './dsm'
import { footprintsIn, pointInRing } from './buildings'
import { sunPosition, taipeiTime } from './sun'
import type { LngLat } from '@/types'

export interface Obstacle { ring: LngLat[]; h: number } // 遮蔽物：平面輪廓＋屋頂高（絕對高程）
/** 平台建物（BIM／量體）：有樓層資料時外牆依樓層分格 */
export interface PlatformTower { cid: string; tower: string; label: string; ring: LngLat[]; top: number; rows?: { level: number; z0: number; z1: number }[] }

export interface SunlightInput {
  mode: 'scene' | 'area'
  center: LngLat
  radiusM: number // 分析半徑
  heightM: number // 區域模式：分析高度
  date: string // YYYY-MM-DD（臺灣時間）
  start: number // 時（例 8）
  end: number // 時（例 16）
  stepMin: number
  obstacles: Obstacle[]
  towers: PlatformTower[]
  targetId?: string // 本案社區（統計每層日照）
}

export interface SunStep { t: number; azimuth: number; elevation: number }
export interface FloorStat { tower: string; label: string; level: number; min: number; avg: number; max: number; n: number }

/** 範圍模式的建物表面網格（外牆＋屋頂），座標為以分析中心為原點的東北上公尺 */
export interface SceneCells {
  count: number
  positions: Float32Array // 每格 2 個三角形、6 個頂點
  normals: Float32Array
  hours: Float32Array
  kind: Uint8Array // 0 外牆、1 屋頂
  lit: Uint8Array // count × 時刻數
}

export interface SunlightResult {
  input: SunlightInput
  steps: SunStep[]
  totalHours: number // 時段長度（小時）
  // 地面
  image?: HTMLCanvasElement
  bounds?: [number, number, number, number]
  groundZ: number
  avgHours?: number
  pctOver: { h: number; pct: number }[]
  shadowFrame?: (i: number) => HTMLCanvasElement // 第 i 個時刻的陰影圖（陰影動畫）
  // 範圍模式
  cells?: SceneCells
  colorsFor?: (k: number | null) => Float32Array
  stats?: { label: string; avg: number }[]
  buildings?: number
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
    // 加速：8×8 格分塊最大高，再取 3×3 鄰塊最大（射線在塊內前進 8 格內不會越過未檢查的建物）
    const B = Grid.B
    this.bw = Math.ceil(this.w / B)
    this.bh = Math.ceil(this.h / B)
    const raw = new Float32Array(this.bw * this.bh)
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const k = ((y / B) | 0) * this.bw + ((x / B) | 0)
        if (this.H[y * this.w + x] > raw[k]) raw[k] = this.H[y * this.w + x]
      }
    this.blk = new Float32Array(this.bw * this.bh)
    for (let by = 0; by < this.bh; by++)
      for (let bx = 0; bx < this.bw; bx++) {
        let m = 0
        for (let j = Math.max(0, by - 1); j <= Math.min(this.bh - 1, by + 1); j++)
          for (let i = Math.max(0, bx - 1); i <= Math.min(this.bw - 1, bx + 1); i++) m = Math.max(m, raw[j * this.bw + i])
        this.blk[by * this.bw + bx] = m
      }
  }
  static B = 8
  bw = 0
  bh = 0
  blk = new Float32Array(0)
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
    const B = Grid.B
    for (let s = ds; ; ) {
      const rz = z + s * rise
      if (rz > this.maxH) return true
      const px = gx + dx * s
      const py = gy + dy * s
      const x = Math.floor(px)
      const y = Math.floor(py)
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return true
      // 射線高於鄰近塊的最高建物：一次跳 B 格
      if (rz > this.blk[((y / B) | 0) * this.bw + ((x / B) | 0)]) { s += B; continue }
      if (this.H[y * this.w + x] > rz) return false
      s += ds
    }
  }
}

// 讓出主執行緒（約每 200 ms 一次），讓畫面與「計算中」狀態能更新
let lastYield = 0
const tick = async () => {
  if (performance.now() - lastYield < 200) return
  await new Promise((r) => setTimeout(r, 0))
  lastYield = performance.now()
}

function sunSteps(input: SunlightInput) {
  const { center, date, start, end, stepMin } = input
  const steps: SunStep[] = []
  const n = Math.max(1, Math.round(((end - start) * 60) / stepMin))
  for (let k = 0; k < n; k++) {
    const t = start + ((k + 0.5) * stepMin) / 60 // 每個間隔取中點
    const p = sunPosition(taipeiTime(date, t), center[1], center[0])
    steps.push({ t, ...p })
  }
  const dirs = steps.map((s) => {
    const a = (s.azimuth * Math.PI) / 180
    const e = (s.elevation * Math.PI) / 180
    return { up: s.elevation > 0.5, dx: Math.sin(a), dy: -Math.cos(a), tanE: Math.tan(e) }
  })
  return { steps, dirs, stepH: stepMin / 60, totalHours: (n * stepMin) / 60 }
}

const centroid = (r: LngLat[]): LngLat => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length]

/** 遮蔽物：平台建物＋地政局三維建物（向量輪廓，2 公尺柵格化）；無向量資料時退回 DSM */
async function buildGrid(input: SunlightInput, half: number) {
  const { center } = input
  const mx = 111320 * Math.cos((center[1] * Math.PI) / 180)
  const my = 110574
  const fps = await footprintsIn(center[0] - half / mx, center[1] - half / my, center[0] + half / mx, center[1] + half / my)
  // 地政局資料若在平台建物位置已有舊建物，以平台模型為準
  const rings = input.towers.map((t) => t.ring)
  const ty = fps.filter((f) => !rings.some((r) => pointInRing(centroid(f.ring), r)))
  const dsm = ty.length ? null : await dsmFor(center)
  const grid = new Grid(center, half, dsm, [...input.obstacles, ...ty.map((f) => ({ ring: f.ring, h: f.h }))])
  const source = ty.length ? '桃園市政府地政局 三維建物（向量輪廓）＋平台社區建物模型' : dsm ? `${dsm.source}＋平台社區建物模型` : '平台社區建物模型（此區無地政局三維建物）'
  return { grid, ty, source }
}

/** 地面（或指定高度）格網：日照時數圖＋各時刻陰影圖 */
async function groundGrid(grid: Grid, center: LngLat, R: number, z0: number, dirs: ReturnType<typeof sunSteps>['dirs'], stepH: number, totalHours: number) {
  const res = 4 // 取樣解析度（公尺）
  const size = Math.round((2 * R) / res)
  const [cgx, cgy] = grid.toGrid(center)
  const hours = new Float32Array(size * size).fill(-1)
  const shadow: Uint8Array[] = dirs.map(() => new Uint8Array(size * size)) // 1＝陰影、2＝建物內
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
    await tick()
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
    image: canvas,
    bounds: [sw[0], sw[1], ne[0], ne[1]] as [number, number, number, number],
    avg: cnt ? sum / cnt : 0,
    pctOver: [1, 2, 3].map((h, k) => ({ h, pct: cnt ? over[k] / cnt : 0 })),
    shadowFrame,
  }
}

interface Surf { ring: LngLat[]; top: number; rows: { level: number; z0: number; z1: number }[] | null; tower?: PlatformTower }

export async function computeSunlight(input: SunlightInput): Promise<SunlightResult> {
  const { center } = input
  const R = input.radiusM
  const { steps, dirs, stepH, totalHours } = sunSteps(input)
  const nK = steps.length

  if (input.mode === 'area') {
    const { grid, source } = await buildGrid(input, R + 320)
    const g = await groundGrid(grid, center, R, input.heightM, dirs, stepH, totalHours)
    return { input, steps, totalHours, source, groundZ: input.heightM, image: g.image, bounds: g.bounds, avgHours: g.avg, pctOver: g.pctOver, shadowFrame: g.shadowFrame }
  }

  // ── 範圍模式：半徑內所有建物的外牆＋屋頂＋地面 ──────────────────────────
  const t0 = performance.now()
  const half = R + 320
  const { grid, ty, source } = await buildGrid(input, half)
  const mx = grid.mx, my = grid.my
  const loc = ([lng, lat]: LngLat): [number, number] => [(lng - center[0]) * mx, (lat - center[1]) * my]
  const near = (ring: LngLat[]) => ring.some((p) => Math.hypot(...loc(p)) <= R)
  const surfs: Surf[] = [
    ...input.towers.filter((t) => near(t.ring)).map((t) => ({ ring: t.ring, top: t.top, rows: t.rows ?? null, tower: t })),
    ...ty.filter((f) => near(f.ring)).map((f) => ({ ring: f.ring, top: f.h, rows: null })),
  ]

  const P: number[] = [] // 頂點
  const Nn: number[] = [] // 法向量
  const hrs: number[] = []
  const kinds: number[] = []
  const lits: Uint8Array[] = []
  const tag: (FloorStat | null)[] = []
  const stat = new Map<string, FloorStat & { sum: number }>()
  const [cgx, cgy] = grid.toGrid(center)
  const sample = (e: number, n: number, z: number) => {
    const gx = cgx + e / grid.cell
    const gy = cgy - n / grid.cell
    if (grid.at(gx, gy) > z + 0.3) return null // 取樣點落在較高的鄰棟內（共同壁、被覆蓋的屋頂）：不計
    const mask = new Uint8Array(nK)
    let lit = 0
    dirs.forEach((d, k) => {
      if (d.up && grid.lit(gx, gy, z, d.dx, d.dy, d.tanE * grid.cell)) { lit++; mask[k] = 1 }
    })
    return { hours: lit * stepH, mask }
  }
  const pushQuad = (q: [number, number, number][], nrm: [number, number, number], h: number, mask: Uint8Array, kind: number, fs: (FloorStat & { sum: number }) | null) => {
    for (const i of [0, 1, 2, 0, 2, 3]) { P.push(...q[i]); Nn.push(...nrm) }
    hrs.push(h)
    kinds.push(kind)
    lits.push(mask)
    tag.push(fs)
    if (fs) { fs.sum += h; fs.n++; fs.min = Math.min(fs.min, h); fs.max = Math.max(fs.max, h) }
  }

  for (let bi = 0; bi < surfs.length; bi++) {
    const s = surfs[bi]
    const L = s.ring.map(loc)
    if (L.length > 1 && L[0][0] === L[L.length - 1][0] && L[0][1] === L[L.length - 1][1]) L.pop()
    if (L.length < 3) continue
    let area = 0
    for (let i = 0; i < L.length; i++) { const [a, b] = L[i], [c, d] = L[(i + 1) % L.length]; area += a * d - c * b }
    const ccw = area > 0
    const rows = s.rows?.filter((r) => r.z1 > r.z0 + 0.5).map((r) => ({ ...r, z1: Math.min(r.z1, s.top) }))
      ?? (() => { const nr = Math.max(1, Math.round(s.top / 3)); return Array.from({ length: nr }, (_, i) => ({ level: 0, z0: (i * s.top) / nr, z1: ((i + 1) * s.top) / nr })) })()
    const isTarget = !!s.tower && s.tower.cid === input.targetId && !!s.tower.rows
    // 外牆：沿每邊每約 3 公尺 × 每層（或每 3 公尺）一格；網格面往外推 0.3 公尺，取樣點往外推 1 公尺
    for (let i = 0; i < L.length; i++) {
      const [ax, ay] = L[i]
      const [bx, by] = L[(i + 1) % L.length]
      const len = Math.hypot(bx - ax, by - ay)
      if (len < 0.8) continue
      const ux = (bx - ax) / len, uy = (by - ay) / len
      const nx = ccw ? uy : -uy, ny = ccw ? -ux : ux
      const k = Math.max(1, Math.round(len / 3))
      for (let j = 0; j < k; j++) {
        const t0 = (j / k) * len, t1 = ((j + 1) / k) * len, tm = (t0 + t1) / 2
        const p0 = [ax + ux * t0 + nx * 0.3, ay + uy * t0 + ny * 0.3]
        const p1 = [ax + ux * t1 + nx * 0.3, ay + uy * t1 + ny * 0.3]
        const se = ax + ux * tm + nx * 1.0, sn = ay + uy * tm + ny * 1.0
        for (const r of rows) {
          const z = r.z1 - r.z0 >= 2.4 && s.rows ? r.z0 + 1.5 : (r.z0 + r.z1) / 2
          const res = sample(se, sn, z)
          if (!res) continue
          let fs: (FloorStat & { sum: number }) | null = null
          if (isTarget) {
            const key = `${s.tower!.tower}:${r.level}`
            if (!stat.has(key)) stat.set(key, { tower: s.tower!.tower, label: s.tower!.label, level: r.level, min: Infinity, avg: 0, max: 0, n: 0, sum: 0 })
            fs = stat.get(key)!
          }
          pushQuad([[p0[0], p0[1], r.z0], [p1[0], p1[1], r.z0], [p1[0], p1[1], r.z1], [p0[0], p0[1], r.z1]], [nx, ny, 0], res.hours, res.mask, 0, fs)
        }
      }
    }
    // 屋頂：3 公尺方格，中心在輪廓內者
    const xs = L.map((p) => p[0]), ys = L.map((p) => p[1])
    const c = 3
    const zr = s.top + 0.3
    for (let x = Math.min(...xs) + c / 2; x < Math.max(...xs); x += c)
      for (let y = Math.min(...ys) + c / 2; y < Math.max(...ys); y += c) {
        if (!pointInRing([x, y], L)) continue
        const res = sample(x, y, s.top + 0.2)
        if (!res) continue
        const h = c / 2
        pushQuad([[x - h, y - h, zr], [x + h, y - h, zr], [x + h, y + h, zr], [x - h, y + h, zr]], [0, 0, 1], res.hours, res.mask, 1, null)
      }
    await tick()
  }

  const count = hrs.length
  console.info(`[日照] ${surfs.length} 棟、${count} 格、${nK} 時刻，${Math.round(performance.now() - t0)} ms`)
  const cells: SceneCells = {
    count,
    positions: new Float32Array(P),
    normals: new Float32Array(Nn),
    hours: new Float32Array(hrs),
    kind: new Uint8Array(kinds),
    lit: new Uint8Array(count * nK),
  }
  lits.forEach((m, i) => cells.lit.set(m, i * nK))
  const cache = new Map<number, Float32Array>()
  const colorsFor = (k: number | null) => {
    const key = k ?? -1
    if (!cache.has(key)) {
      const col = new Float32Array(count * 18)
      for (let i = 0; i < count; i++) {
        const rgb = k == null ? hoursColor(cells.hours[i], totalHours) : cells.lit[i * nK + k] ? [253, 224, 71] : [51, 65, 85]
        for (let v = 0; v < 6; v++) col.set([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255], i * 18 + v * 3)
      }
      cache.set(key, col)
    }
    return cache.get(key)!
  }

  const g = await groundGrid(grid, center, R, 0.5, dirs, stepH, totalHours)
  const avgOf = (f: (i: number) => boolean) => {
    let s = 0, n = 0
    for (let i = 0; i < count; i++) if (f(i)) { s += cells.hours[i]; n++ }
    return n ? s / n : null
  }
  const targetCells = tag.map((t, i) => (t ? i : -1)).filter((i) => i >= 0)
  const wallIdx = targetCells.length ? targetCells : [...Array(count).keys()].filter((i) => cells.kind[i] === 0)
  const wallH = wallIdx.map((i) => cells.hours[i])
  const floors = [...stat.values()].map(({ sum, ...f }) => ({ ...f, min: f.n ? f.min : 0, avg: f.n ? sum / f.n : 0 }))
  const stats = [
    { label: targetCells.length ? '本案外牆' : '外牆', avg: wallH.length ? wallH.reduce((a, b) => a + b, 0) / wallH.length : 0 },
    { label: '周邊外牆', avg: avgOf((i) => cells.kind[i] === 0 && !tag[i]) ?? 0 },
    { label: '屋頂', avg: avgOf((i) => cells.kind[i] === 1) ?? 0 },
    { label: '地面', avg: g.avg },
  ]
  return {
    input, steps, totalHours, source,
    groundZ: 0.5,
    image: g.image, bounds: g.bounds, shadowFrame: g.shadowFrame,
    avgHours: stats[0].avg,
    pctOver: [1, 2, 3].map((h) => ({ h, pct: wallH.length ? wallH.filter((x) => x >= h).length / wallH.length : 0 })),
    cells, colorsFor, stats, buildings: surfs.length,
    floors: floors.length ? floors : undefined,
  }
}
