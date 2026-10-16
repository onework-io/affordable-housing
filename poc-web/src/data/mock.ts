// 以固定亂數種子產生示範房源與生活設施（PoC 假資料，每次載入結果相同）
import type { Community, Facility, FacilityCategory, LngLat, Unit, UnitStatus } from '@/types'
import { CATEGORY, CATEGORY_KEYS } from '@/config/lifeCircle'
import { destination } from '@/utils/geo'
import { COMMUNITIES, ON_SALE_TARGET } from './communities'
import { DEMO_VR } from '@/config/vr'

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LAYOUTS = [
  { layout: '二房二廳一衛', area: 33.05, indoor: 22.5 },
  { layout: '二房二廳二衛', area: 37.8, indoor: 25.7 },
  { layout: '三房二廳二衛', area: 45.2, indoor: 30.6 },
  { layout: '一房一廳一衛', area: 22.4, indoor: 15.1 },
]

export function buildUnits(c: Community): Unit[] {
  const rnd = mulberry32(c.id.split('').reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7))
  const units: Unit[] = []
  for (const t of c.towers) {
    for (let lv = t.fromFloor; lv <= t.toFloor; lv++) {
      t.unitCodes.forEach((code, i) => {
        const L = LAYOUTS[i % LAYOUTS.length]
        const prefix = t.label ? `${t.label} ` : ''
        units.push({
          id: `${c.id}-${t.id}-${lv}F-${code}`,
          communityId: c.id,
          tower: t.id,
          level: lv,
          code,
          label: `${prefix}${lv}F-${code}`,
          layout: L.layout,
          area: L.area,
          indoorArea: L.indoor,
          price: null,
          status: 'sold',
          panoUrl: null,
        })
      })
    }
  }
  // 依目標數量挑出售中戶，其餘標為已售／保留
  const target = c.demoOnSale ?? ON_SALE_TARGET[c.id] ?? 0
  const pool = [...units]
  for (let k = 0; k < target && pool.length; k++) {
    const u = pool.splice(Math.floor(rnd() * pool.length), 1)[0]
    u.status = 'on-sale'
    u.price = rnd() < 0.8 ? Math.round(u.area * (28 + rnd() * 6)) : null
    u.panoUrl = rnd() < 0.7 ? DEMO_VR.url : null
  }
  for (const u of pool) u.status = (rnd() < 0.08 ? 'reserved' : 'sold') as UnitStatus
  return units.sort((a, b) => a.tower.localeCompare(b.tower) || a.level - b.level || a.code.localeCompare(b.code))
}

const NAMES: Record<FacilityCategory, string[]> = {
  medical: ['診所', '藥局', '衛生所', '牙醫診所'],
  shopping: ['超市', '便利商店', '傳統市場', '量販店'],
  school: ['國小', '國中', '幼兒園', '高中'],
  park: ['鄰里公園', '綠地', '運動公園'],
  transit: ['YouBike 站', '捷運站', '轉運站'],
  public: ['區公所', '圖書館', '派出所', '郵局'],
}

export function buildFacilities(): Facility[] {
  const rnd = mulberry32(20261015)
  const out: Facility[] = []
  const seeds: LngLat[] = [...COMMUNITIES.map((c) => c.lngLat), [121.2925, 24.9875], [121.3095, 25.0005]]
  let n = 0
  for (const seed of seeds) {
    for (const cat of CATEGORY_KEYS) {
      const count = cat === 'transit' || cat === 'shopping' ? 6 : 4
      for (let i = 0; i < count; i++) {
        const dist = 0.15 + Math.sqrt(rnd()) * 2.6
        const p = destination(seed, rnd() * 360, dist)
        const names = NAMES[cat]
        n++
        out.push({ id: `F${String(n).padStart(4, '0')}`, category: cat, name: `示範${names[i % names.length]} ${String(n).padStart(3, '0')}`, lngLat: p })
      }
    }
  }
  return out
}

export const CATEGORY_LABEL = (c: FacilityCategory) => CATEGORY[c].label
