// 條件篩選：總價、坪數、房數、是否有 720 環景（只篩平台列出售中的戶別）
import type { Unit } from '@/types'

export interface Band { id: string; label: string; min?: number; max?: number }

export const PRICE_BANDS: Band[] = [
  { id: 'all', label: '不限' },
  { id: 'p1', label: '800 萬以下', max: 800 },
  { id: 'p2', label: '800–1,200 萬', min: 800, max: 1200 },
  { id: 'p3', label: '1,200 萬以上', min: 1200 },
]

export const AREA_BANDS: Band[] = [
  { id: 'all', label: '不限' },
  { id: 'a1', label: '30 坪以下', max: 30 },
  { id: 'a2', label: '30–40 坪', min: 30, max: 40 },
  { id: 'a3', label: '40 坪以上', min: 40 },
]

export const ROOM_OPTIONS = [1, 2, 3]

export interface UnitFilter { price: string; area: string; rooms: number[]; panoOnly: boolean }
export const DEFAULT_FILTER: UnitFilter = { price: 'all', area: 'all', rooms: [], panoOnly: false }

export const isFilterActive = (f: UnitFilter) => f.price !== 'all' || f.area !== 'all' || f.rooms.length > 0 || f.panoOnly

const ROOM_CH: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4 }
export const roomsOf = (u: Unit) => ROOM_CH[u.layout[0]] ?? 0

const inBand = (v: number, b?: Band) => !b || ((b.min === undefined || v >= b.min) && (b.max === undefined || v < b.max))

export function matchUnit(u: Unit, f: UnitFilter): boolean {
  if (u.status !== 'on-sale') return false
  if (f.price !== 'all' && (u.price == null || !inBand(u.price, PRICE_BANDS.find((b) => b.id === f.price)))) return false
  if (f.area !== 'all' && !inBand(u.area, AREA_BANDS.find((b) => b.id === f.area))) return false
  if (f.rooms.length && !f.rooms.includes(roomsOf(u))) return false
  if (f.panoOnly && !u.panoUrl) return false
  return true
}

export function filterSummary(f: UnitFilter): string {
  const parts: string[] = []
  if (f.price !== 'all') parts.push(PRICE_BANDS.find((b) => b.id === f.price)!.label)
  if (f.area !== 'all') parts.push(AREA_BANDS.find((b) => b.id === f.area)!.label)
  if (f.rooms.length) parts.push([...f.rooms].sort().map((n) => `${n} 房`).join('、'))
  if (f.panoOnly) parts.push('有 720 環景')
  return parts.join(' · ')
}
