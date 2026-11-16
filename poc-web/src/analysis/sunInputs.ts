// 由平台社區資料組出日照分析的平台建物（BIM／量體）：平面輪廓、屋頂高、各層樓板高
import type { Community, LngLat, ModelManifest } from '@/types'
import { floorElevation, rotCW, towerFootprint, uploadPlacement } from '@/utils/uploadModel'
import type { Obstacle, PlatformTower } from './sunlight'

/** 社區中心（BIM 錨點或社區座標） */
export const communityCenter = (c: Community): LngLat => c.model?.anchor ?? c.lngLat

const offset = ([lng, lat]: LngLat, e: number, n: number): LngLat => [lng + e / (111320 * Math.cos((lat * Math.PI) / 180)), lat + n / 110574]

function towersOf(c: Community, manifest?: ModelManifest): PlatformTower[] {
  const m = c.model
  const label = (id: string) => c.towers.find((x) => x.id === id)?.label || id
  if (m?.kind === 'upload') {
    const ids = m.towerSplit ? [m.towerSplit.low, m.towerSplit.high] : [c.towers[0]?.id ?? 'M']
    return ids.map((id) => {
      const top = c.towers.find((x) => x.id === id)?.toFloor ?? c.floorsAbove
      return {
        cid: c.id, tower: id, label: label(id),
        ring: m.towerSplit ? towerFootprint(m, id) : uploadPlacement(m).footprint,
        top: floorElevation(m, top + 1).z,
        rows: Array.from({ length: top }, (_, i) => ({ level: i + 1, z0: floorElevation(m, i + 1).z, z1: floorElevation(m, i + 2).z })),
      }
    })
  }
  if (m?.outlines) {
    return m.outlines.map((o) => {
      const ring = o.ring.map(([e, n]) => {
        const [x, y] = rotCW(e, n, m.yaw)
        return offset(m.anchor, x, y)
      })
      if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0])
      const isTower = c.towers.some((t) => t.id === o.tower)
      const fl = (isTower ? manifest?.floors ?? [] : []).filter((f) => f.tower === o.tower && f.level < 99).sort((a, b) => a.level - b.level)
      const rows = fl.map((f, i) => ({ level: f.level, z0: m.altitude + f.minY, z1: m.altitude + (fl[i + 1]?.minY ?? o.top) }))
      return { cid: c.id, tower: o.tower, label: label(o.tower), ring, top: m.altitude + o.top, rows: rows.length ? rows : undefined }
    })
  }
  if (!m && c.massing) {
    const fh = c.massing.floorHeight
    const t = c.towers[0]
    return [{
      cid: c.id, tower: t?.id ?? 'M', label: t?.label || '', ring: c.massing.footprint, top: c.floorsAbove * fh,
      rows: Array.from({ length: c.floorsAbove }, (_, i) => ({ level: i + 1, z0: i * fh, z1: (i + 1) * fh })),
    }]
  }
  return []
}

export function sunInputs(all: Community[], manifests: Record<string, ModelManifest>): { obstacles: Obstacle[]; towers: PlatformTower[] } {
  const towers = all.flatMap((c) => towersOf(c, manifests[c.id]))
  return { towers, obstacles: towers.map((t) => ({ ring: t.ring, h: t.top })) }
}
