// 由平台社區資料組出日照分析的遮蔽物（建物）與立面取樣
import type { Community, LngLat } from '@/types'
import { floorElevation, towerFootprint, uploadPlacement } from '@/utils/uploadModel'
import type { FacadeTower, Obstacle } from './sunlight'

/** 社區中心（BIM 錨點或社區座標） */
export const communityCenter = (c: Community): LngLat => c.model?.anchor ?? c.lngLat

/** 可做立面日照的社區：上傳／單一 GLB 模型或量體示意 */
export const canFacade = (c: Community) => c.model?.kind === 'upload' || (!c.model && !!c.massing)

function towersOf(c: Community): { tower: string; label: string; ring: LngLat[]; top: number; levels: { level: number; z: number }[] }[] {
  const m = c.model
  if (m?.kind === 'upload') {
    const ids = m.towerSplit ? [m.towerSplit.low, m.towerSplit.high] : [c.towers[0]?.id ?? 'M']
    return ids.map((id) => {
      const t = c.towers.find((x) => x.id === id)
      const top = t?.toFloor ?? c.floorsAbove
      return {
        tower: id,
        label: t?.label || id,
        ring: m.towerSplit ? towerFootprint(m, id) : uploadPlacement(m).footprint,
        top: floorElevation(m, top + 1).z,
        // 每層取窗台高度（樓板上 1.5 公尺）
        levels: Array.from({ length: top }, (_, i) => ({ level: i + 1, z: floorElevation(m, i + 1).z + 1.5 })),
      }
    })
  }
  if (!m && c.massing) {
    const fh = c.massing.floorHeight
    const t = c.towers[0]
    return [{
      tower: t?.id ?? 'M', label: t?.label || '', ring: c.massing.footprint, top: c.floorsAbove * fh,
      levels: Array.from({ length: c.floorsAbove }, (_, i) => ({ level: i + 1, z: i * fh + 1.5 })),
    }]
  }
  return []
}

export function sunInputs(all: Community[], target: Community): { obstacles: Obstacle[]; facades: FacadeTower[] } {
  const obstacles: Obstacle[] = []
  for (const c of all) for (const t of towersOf(c)) obstacles.push({ ring: t.ring, h: t.top })
  const facades = towersOf(target).map(({ tower, label, ring, levels }) => ({ tower, label, ring, levels }))
  return { obstacles, facades }
}
