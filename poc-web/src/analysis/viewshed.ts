// 視野分析（Viewshed）：以視線演算法（Line of Sight）從觀察點向四周放射，
// 沿每條視線記錄目前最大仰角，格網高度（建物高）的仰角不低於此值即為可見，否則被遮蔽。
// 地表模型：桃園市三維建物柵格（scripts/build_dsm.py，4 公尺格網，地形視為平坦）。
import dsmUrl from '@/data/dsm.png'
import meta from '@/data/dsm.json'
import type { LngLat } from '@/types'

export interface ViewshedInput {
  center: LngLat
  eyeH: number // 觀察點高度（公尺，地面起算）
  radiusM: number
  excludeM?: number // 觀察點所在建物範圍（不視為遮蔽物）
}
export interface ViewshedResult {
  image: HTMLCanvasElement
  bounds: [number, number, number, number] // [西, 南, 東, 北]
  visiblePct: number
  visibleHa: number
  totalHa: number
  input: ViewshedInput
}

const [W0, S0, , N0] = meta.bbox as [number, number, number, number]
const GW = meta.width
const GH = meta.height
const CELL = meta.cellM
const MID = (N0 + S0) / 2
const MX = 111320 * Math.cos((MID * Math.PI) / 180)
const MY = 110574

let dsm: Promise<Uint8Array> | null = null
function loadDsm(): Promise<Uint8Array> {
  dsm ??= new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = GW
      c.height = GH
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0)
      const px = ctx.getImageData(0, 0, GW, GH).data
      const h = new Uint8Array(GW * GH)
      for (let i = 0; i < h.length; i++) h[i] = px[i * 4]
      resolve(h)
    }
    img.onerror = () => {
      dsm = null
      reject(new Error('地表模型載入失敗'))
    }
    img.src = dsmUrl
  })
  return dsm
}

export const DSM_SOURCE = meta.source

export async function computeViewshed(input: ViewshedInput): Promise<ViewshedResult> {
  const H = await loadDsm()
  const { center, eyeH, radiusM } = input
  const excludeM = input.excludeM ?? 35
  // 觀察點在 DSM 格網中的位置（浮點）
  const ox = ((center[0] - W0) * MX) / CELL
  const oy = ((N0 - center[1]) * MY) / CELL
  const R = Math.round(radiusM / CELL)
  const size = 2 * R + 1
  const x0 = Math.round(ox) - R
  const y0 = Math.round(oy) - R
  const mask = new Uint8Array(size * size) // 0＝範圍外、1＝可見、2＝不可見
  const exC = excludeM / CELL
  const heightAt = (gx: number, gy: number, distCells: number) => {
    if (distCells <= exC) return 0
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return 0
    return H[gy * GW + gx]
  }
  // 放射視線：射向方框邊上每一格
  const targets: [number, number][] = []
  for (let i = -R; i <= R; i++) targets.push([i, -R], [i, R], [-R, i], [R, i])
  for (const [tx, ty] of targets) {
    const steps = Math.max(Math.abs(tx), Math.abs(ty))
    const dx = tx / steps
    const dy = ty / steps
    let maxSlope = -Infinity
    for (let s = 1; s <= steps; s++) {
      const lx = Math.round(dx * s)
      const ly = Math.round(dy * s)
      const dCells = Math.hypot(lx, ly)
      if (dCells > R) break
      const gx = x0 + R + lx
      const gy = y0 + R + ly
      const h = heightAt(gx, gy, dCells)
      const slope = (h - eyeH) / (dCells * CELL)
      const idx = (ly + R) * size + (lx + R)
      const vis = slope >= maxSlope
      if (vis) mask[idx] = 1
      else if (mask[idx] !== 1) mask[idx] = 2
      if (slope > maxSlope) maxSlope = slope
    }
  }
  // 觀察點附近（自身建物）視為可見
  for (let ly = -R; ly <= R; ly++)
    for (let lx = -R; lx <= R; lx++) {
      const d = Math.hypot(lx, ly)
      const idx = (ly + R) * size + (lx + R)
      if (d > R) mask[idx] = 0
      else if (d <= exC) mask[idx] = 1
      else if (!mask[idx]) mask[idx] = 2
    }
  // 上色
  const image = new ImageData(size, size)
  let vis = 0
  let tot = 0
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i]
    if (!m) continue
    tot++
    const o = i * 4
    if (m === 1) {
      vis++
      image.data[o] = 16; image.data[o + 1] = 185; image.data[o + 2] = 129; image.data[o + 3] = 125
    } else {
      image.data[o] = 225; image.data[o + 1] = 29; image.data[o + 2] = 72; image.data[o + 3] = 100
    }
  }
  const west = W0 + (x0 * CELL) / MX
  const north = N0 - (y0 * CELL) / MY
  const east = W0 + ((x0 + size) * CELL) / MX
  const south = N0 - ((y0 + size) * CELL) / MY
  const cellHa = (CELL * CELL) / 10000
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  return {
    image: canvas,
    bounds: [west, south, east, north],
    visiblePct: tot ? vis / tot : 0,
    visibleHa: vis * cellHa,
    totalHa: tot * cellHa,
    input,
  }
}
