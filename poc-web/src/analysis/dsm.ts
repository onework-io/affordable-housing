// 數值地表模型（DSM）：桃園市三維建物柵格（scripts/build_dsm.py，4 公尺格網、地形視為平坦）。
// 可有多塊範圍（桃園區示範範圍、中壢運動園區），依座標自動選用。
import urlTy from '@/data/dsm.png'
import metaTy from '@/data/dsm.json'
import urlZl from '@/data/dsm_zhongli.png'
import metaZl from '@/data/dsm_zhongli.json'
import type { LngLat } from '@/types'

export interface Dsm {
  bbox: [number, number, number, number] // [西, 南, 東, 北]
  width: number
  height: number
  cellM: number
  mx: number // 每經度公尺
  my: number // 每緯度公尺
  H: Uint8Array // 建物高（公尺）
  source: string
}

const SOURCES = [
  { url: urlTy, meta: metaTy },
  { url: urlZl, meta: metaZl },
]
const cache = new Map<string, Promise<Dsm>>()

function load(src: (typeof SOURCES)[number]): Promise<Dsm> {
  if (!cache.has(src.url))
    cache.set(
      src.url,
      new Promise((resolve, reject) => {
        const m = src.meta
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = m.width
          c.height = m.height
          const ctx = c.getContext('2d', { willReadFrequently: true })!
          ctx.drawImage(img, 0, 0)
          const px = ctx.getImageData(0, 0, m.width, m.height).data
          const H = new Uint8Array(m.width * m.height)
          for (let i = 0; i < H.length; i++) H[i] = px[i * 4]
          const bbox = m.bbox as [number, number, number, number]
          const mid = (bbox[1] + bbox[3]) / 2
          resolve({ bbox, width: m.width, height: m.height, cellM: m.cellM, mx: 111320 * Math.cos((mid * Math.PI) / 180), my: 110574, H, source: m.source })
        }
        img.onerror = () => {
          cache.delete(src.url)
          reject(new Error('地表模型載入失敗'))
        }
        img.src = src.url
      }),
    )
  return cache.get(src.url)!
}

const inside = (b: number[], [lng, lat]: LngLat) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3]

/** 涵蓋此點的 DSM（無則 null） */
export async function dsmFor(p: LngLat): Promise<Dsm | null> {
  const src = SOURCES.find((s) => inside(s.meta.bbox, p))
  return src ? load(src) : null
}

/** 是否有 DSM 涵蓋此點（不載入） */
export const hasDsm = (p: LngLat) => SOURCES.some((s) => inside(s.meta.bbox, p))

/** 取 DSM 高度（公尺，範圍外為 0） */
export function sampleDsm(d: Dsm, lng: number, lat: number): number {
  const x = Math.floor(((lng - d.bbox[0]) * d.mx) / d.cellM)
  const y = Math.floor(((d.bbox[3] - lat) * d.my) / d.cellM)
  if (x < 0 || y < 0 || x >= d.width || y >= d.height) return 0
  return d.H[y * d.width + x]
}
