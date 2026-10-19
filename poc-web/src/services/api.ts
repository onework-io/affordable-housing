// 資料存取層：PoC 由前端示範資料回應，並套用後台（adminStore）的設定；
// 正式版改呼叫後端 API（住宅資料服務、生活圈畫圈服務…），介面維持 Promise，UI 不需改動。
import type { BusStop, Community, Facility, LifeCircleQuery, LifeCircleResult, ModelManifest, ModelPlacement, Unit } from '@/types'
import { COMMUNITIES } from '@/data/communities'
import { buildFacilities, buildUnits } from '@/data/mock'
import { haversine } from '@/utils/geo'
import { useAdminStore } from '@/admin/adminStore'
import busData from '@/data/bus-stops.json'

const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms))

const baseUnitCache = new Map<string, Unit[]>()
let baseFacilities: Facility[] | null = null

/** 套用後台覆寫後的全部社區（含停用者，供後台使用） */
export function listCommunitiesAll(): (Community & { enabled: boolean })[] {
  const { communityOverrides, addedCommunities } = useAdminStore.getState()
  return [...COMMUNITIES, ...addedCommunities].map((c) => {
    const o = communityOverrides[c.id] ?? {}
    // 後台上傳的 GLB 可取代分層模型，也可加到只有量體的社區
    const model = o.model?.kind === 'upload' ? ({ ...(c.model ?? {}), ...o.model } as ModelPlacement) : c.model && o.model ? { ...c.model, ...o.model } : c.model
    return {
      ...c,
      ...(o.name ? { name: o.name } : {}),
      ...(o.district ? { district: o.district } : {}),
      ...(o.address ? { address: o.address } : {}),
      ...(o.lngLat ? { lngLat: o.lngLat } : {}),
      model,
      enabled: o.enabled !== false,
    }
  })
}

/** GET /communities（前台：只回傳啟用圖台顯示的社區） */
export const getCommunities = (): Promise<Community[]> => delay(listCommunitiesAll().filter((c) => c.enabled))

/** 套用後台覆寫後的戶別（同步，供後台使用） */
export function listUnits(communityId: string): Unit[] {
  const c = listCommunitiesAll().find((x) => x.id === communityId)
  if (!c) return []
  if (!baseUnitCache.has(communityId)) baseUnitCache.set(communityId, buildUnits(c))
  const ov = useAdminStore.getState().unitOverrides
  return baseUnitCache.get(communityId)!.map((u) => (ov[u.id] ? { ...u, ...ov[u.id] } : u))
}

/** GET /communities/:id/units */
export function getUnits(communityId: string): Promise<Unit[]> {
  if (!listCommunitiesAll().some((c) => c.id === communityId)) return Promise.reject(new Error(`unknown community ${communityId}`))
  return delay(listUnits(communityId))
}

/** 全部（啟用中）社區的戶別，供條件篩選與社區比較（正式版：GET /units?status=on-sale） */
export const getAllUnits = (): Promise<Record<string, Unit[]>> =>
  delay(Object.fromEntries(listCommunitiesAll().filter((c) => c.enabled).map((c) => [c.id, listUnits(c.id)])))

/** 全部社區的出售中戶數（GET /communities?include=stats） */
export async function getOnSaleCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const c of listCommunitiesAll()) out[c.id] = listUnits(c.id).filter((u) => u.status === 'on-sale').length
  return out
}

/** 示範設施＋後台匯入的設施（不含後台停用的類別） */
export function listFacilities(includeDisabled = false): Facility[] {
  baseFacilities ??= buildFacilities()
  const { importedFacilities, categoryEnabled } = useAdminStore.getState()
  const all = [...baseFacilities, ...importedFacilities]
  return includeDisabled ? all : all.filter((f) => categoryEnabled[f.category] !== false)
}

/** GET /facilities */
export const getFacilities = (): Promise<Facility[]> => delay(listFacilities())

/**
 * POST /life-circle/query
 * 正式版：PostGIS ST_DWithin(geom::geography, center, radius) 由後端計算。
 */
export async function queryLifeCircle(q: LifeCircleQuery): Promise<LifeCircleResult> {
  const facilities = listFacilities()
    .map((f) => ({ ...f, distanceKm: haversine(q.center, f.lngLat) }))
    .filter((f) => f.distanceKm <= q.radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
  const communities = listCommunitiesAll()
    .filter((c) => c.enabled)
    .map((c) => ({ id: c.id, distanceKm: haversine(q.center, c.lngLat) }))
    .filter((c) => c.distanceKm <= q.radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
  return delay({ facilities, communities }, 60)
}

const manifestCache = new Map<string, Promise<ModelManifest>>()
export function getModelManifest(url: string): Promise<ModelManifest> {
  if (!manifestCache.has(url))
    manifestCache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`模型清單載入失敗 HTTP ${r.status}`)
      return r.json()
    }))
  return manifestCache.get(url)!
}

/** 公車站牌（src/data/bus-stops.json，由 scripts/build_bus_stops.py 產生，直接打包進程式，不另外下載）；
 *  正式版改接 TDX 或市府公車 API */
export const getBusStops = (): Promise<BusStop[]> => delay((busData as unknown as { stops: BusStop[] }).stops, 0)
