// 共用狀態：2D/3D 是同一個地圖實例，選取建案、查詢條件與生活圈都放在這裡，切換圖台不會遺失。
import { create } from 'zustand'
import type { BusStop, Community, Facility, FacilityCategory, LifeCircleQuery, LifeCircleResult, LngLat, ModelManifest, PoiCategory, PoiHit, TravelMode, Unit, ViewMode } from '@/types'
import { CATEGORY_KEYS, defaultMinutes, minuteRange, radiusKm } from '@/config/lifeCircle'
import * as api from '@/services/api'
import { loadPoiDb, searchPoi } from '@/services/poi'
import { circleBounds } from '@/utils/geo'
import { DEFAULT_FILTER, matchUnit, type UnitFilter } from '@/config/filters'
import type { ViewshedResult } from '@/analysis/viewshed'
import type { SunlightResult } from '@/analysis/sunlight'

export type CenterSource = { type: 'community'; id: string } | { type: 'point'; lngLat: LngLat }

interface FlyRequest { key: number; center?: LngLat; zoom?: number; bounds?: [LngLat, LngLat] }

interface AppState {
  ready: boolean
  communities: Community[]
  onSaleCounts: Record<string, number>
  facilities: Facility[]
  units: Unit[]
  unitsLoading: boolean

  viewMode: ViewMode
  selectedCommunityId: string | null
  selectedUnitId: string | null
  floorFilter: { tower: string; level: number } | null
  panoUnitId: string | null

  mode: TravelMode
  minutes: number
  center: CenterSource
  pickingPoint: boolean
  categories: Set<FacilityCategory>
  onlyOnSale: boolean
  query: LifeCircleQuery | null
  result: LifeCircleResult | null
  fly: FlyRequest | null

  // 條件篩選與社區比較
  allUnits: Record<string, Unit[]>
  filter: UnitFilter
  matchCounts: Record<string, number>
  compareIds: string[]
  compareOpen: boolean

  // 公車站牌
  busStops: BusStop[]
  showBus: boolean
  /** 動態公車（模擬）與時間倍速 */
  busSim: boolean
  busSpeed: number
  /** 視野分析 */
  viewshed: (ViewshedResult & { label: string }) | null
  viewshedBusy: boolean
  viewshedRadius: number
  /** 單棟檢視（three.js）中的社區 */
  buildingViewId: string | null
  /** 日照分析 */
  sun: SunParams
  sunlight: SunlightResult | null
  sunBusy: boolean
  sunError: string | null
  /** 陰影動畫：目前顯示第幾個時刻（null＝顯示日照時數） */
  sunStep: number | null
  /** 生活圈 POI 搜尋 */
  poiReady: boolean
  poiError: string | null
  poiMeta: { name: string; built: string; count: number; license: string } | null
  poiQ: string
  poiCats: Set<PoiCategory>
  /** 生活圈內符合關鍵字的 POI（不分類別，供各類別計數） */
  poiAll: PoiHit[]
  /** 再依類別篩選後的結果（地圖與清單） */
  poiHits: PoiHit[]
  poiSel: PoiHit | null
  showPoi: boolean

  init: () => Promise<void>
  setViewMode: (m: ViewMode) => void
  selectCommunity: (id: string | null, opts?: { fly?: boolean; floor?: { tower: string; level: number } | null }) => Promise<void>
  selectUnit: (id: string | null) => void
  setFloorFilter: (f: { tower: string; level: number } | null) => void
  openPano: (unitId: string | null) => void
  setMode: (m: TravelMode) => void
  setMinutes: (n: number) => void
  setCenterCommunity: (id: string) => void
  startPickPoint: () => void
  setCenterPoint: (p: LngLat) => void
  toggleCategory: (c: FacilityCategory) => void
  setOnlyOnSale: (v: boolean) => void
  runQuery: (fit?: boolean) => Promise<void>
  flyTo: (r: Omit<FlyRequest, 'key'>) => void
  setFilter: (p: Partial<UnitFilter>) => void
  resetFilter: () => void
  toggleCompare: (id: string) => void
  clearCompare: () => void
  setCompareOpen: (v: boolean) => void
  setShowBus: (v: boolean) => void
  setBusSim: (v: boolean) => void
  runViewshed: () => Promise<void>
  clearViewshed: () => void
  setViewshedRadius: (m: number) => void
  setBusSpeed: (v: number) => void
  openBuilding: (id: string, floor?: { tower: string; level: number } | null) => void
  closeBuilding: () => void
  setSun: (p: Partial<SunParams>) => void
  loadPoi: () => Promise<void>
  refreshPoi: () => void
  setPoiQ: (q: string) => void
  togglePoiCat: (c: PoiCategory, only?: boolean) => void
  selectPoi: (id: string | null, fly?: boolean) => void
  setShowPoi: (v: boolean) => void
  runSunlight: () => Promise<void>
  clearSunlight: () => void
  setSunStep: (i: number | null) => void
}

export interface SunParams {
  date: string
  start: number
  end: number
  stepMin: number
  mode: 'scene' | 'area'
  radiusM: number
  /** 區域模式分析高度：ground＝地面 1.5 m；floor＝所選樓層窗台高 */
  height: 'ground' | 'floor'
}

const MAX_COMPARE = 3
const countMatches = (all: Record<string, Unit[]>, f: UnitFilter) =>
  Object.fromEntries(Object.entries(all).map(([id, us]) => [id, us.filter((u) => matchUnit(u, f)).length]))

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  communities: [],
  onSaleCounts: {},
  facilities: [],
  units: [],
  unitsLoading: false,

  viewMode: '3d',
  selectedCommunityId: null,
  selectedUnitId: null,
  floorFilter: null,
  panoUnitId: null,

  mode: 'walk',
  minutes: defaultMinutes(),
  center: { type: 'community', id: 'A11' },
  pickingPoint: false,
  categories: new Set(CATEGORY_KEYS),
  onlyOnSale: false,
  query: null,
  result: null,
  fly: null,

  allUnits: {},
  filter: DEFAULT_FILTER,
  matchCounts: {},
  compareIds: [],
  compareOpen: false,

  busStops: [],
  showBus: true,
  busSim: true,
  viewshed: null,
  viewshedBusy: false,
  viewshedRadius: 600,
  busSpeed: 10,
  buildingViewId: null,
  sun: { date: `${new Date().getFullYear()}-12-22`, start: 8, end: 16, stepMin: 15, mode: 'scene', radiusM: 150, height: 'ground' },
  sunlight: null,
  sunBusy: false,
  sunError: null,
  sunStep: null,
  poiReady: false,
  poiError: null,
  poiMeta: null,
  poiQ: '',
  poiCats: new Set<PoiCategory>(['restaurant', 'attraction', 'museum', 'hotel', 'consume']),
  poiAll: [],
  poiHits: [],
  poiSel: null,
  showPoi: true,

  init: async () => {
    const [communities, onSaleCounts, facilities, allUnits, busStops] = await Promise.all([api.getCommunities(), api.getOnSaleCounts(), api.getFacilities(), api.getAllUnits(), api.getBusStops()])
    // 後台可能改了時間範圍：把目前時間夾在範圍內
    const r = minuteRange()
    const minutes = Math.min(r.max, Math.max(r.min, get().minutes))
    const sel = get().selectedCommunityId
    const units = sel && communities.some((c) => c.id === sel) ? await api.getUnits(sel) : []
    const compareIds = get().compareIds.filter((id) => communities.some((c) => c.id === id))
    set({ busStops, allUnits, matchCounts: countMatches(allUnits, get().filter), compareIds, communities, onSaleCounts, facilities, minutes, units, ready: true, ...(units.length ? {} : { selectedCommunityId: null, selectedUnitId: null }) })
    await get().runQuery()
    get().loadPoi()
  },

  setViewMode: (viewMode) => set({ viewMode }),

  selectCommunity: async (id, opts) => {
    if (!id) return set({ selectedCommunityId: null, selectedUnitId: null, floorFilter: null, units: [], buildingViewId: null, sunlight: null, sunStep: null })
    if (get().buildingViewId && get().buildingViewId !== id) set({ buildingViewId: null })
    const same = get().selectedCommunityId === id
    set({ selectedCommunityId: id, selectedUnitId: null, floorFilter: opts?.floor ?? null, unitsLoading: !same, ...(same ? {} : { sunlight: null, sunStep: null }) })
    const c = get().communities.find((x) => x.id === id)
    if (c && opts?.fly !== false) get().flyTo({ center: c.lngLat, zoom: 17 })
    if (!same) {
      const units = await api.getUnits(id)
      if (get().selectedCommunityId === id) set({ units, unitsLoading: false })
    }
  },

  selectUnit: (selectedUnitId) => {
    set({ selectedUnitId })
    const c = get().communities.find((x) => x.id === get().selectedCommunityId)
    if (selectedUnitId && c) get().flyTo({ center: c.lngLat, zoom: 17.4 })
  },
  setFloorFilter: (floorFilter) => set({ floorFilter, selectedUnitId: null }),
  openPano: (panoUnitId) => set({ panoUnitId }),

  setMode: (mode) => { set({ mode }); get().runQuery(true) },
  setMinutes: (minutes) => { set({ minutes }); get().runQuery() },
  setCenterCommunity: (id) => { set({ center: { type: 'community', id }, pickingPoint: false }); get().runQuery(true) },
  startPickPoint: () => set({ pickingPoint: true }),
  setCenterPoint: (lngLat) => { set({ center: { type: 'point', lngLat }, pickingPoint: false }); get().runQuery(true) },
  toggleCategory: (c) => {
    const next = new Set(get().categories)
    if (next.has(c)) next.delete(c)
    else next.add(c)
    set({ categories: next })
  },
  setOnlyOnSale: (onlyOnSale) => set({ onlyOnSale }),

  runQuery: async (fit = false) => {
    const { center, mode, minutes, communities } = get()
    let lngLat: LngLat
    let label: string
    if (center.type === 'community') {
      const c = communities.find((x) => x.id === center.id)
      if (!c) return
      lngLat = c.lngLat
      label = c.name
    } else {
      lngLat = center.lngLat
      label = `指定位置 ${lngLat[1].toFixed(4)}, ${lngLat[0].toFixed(4)}`
    }
    const query: LifeCircleQuery = { center: lngLat, centerLabel: label, mode, minutes, radiusKm: radiusKm(mode, minutes) }
    const result = await api.queryLifeCircle(query)
    set({ query, result })
    get().refreshPoi()
    if (fit) {
      get().flyTo({ bounds: circleBounds(lngLat, query.radiusKm) })
    }
  },

  flyTo: (r) => set({ fly: { ...r, key: Date.now() } }),

  setFilter: (p) => {
    const filter = { ...get().filter, ...p }
    set({ filter, matchCounts: countMatches(get().allUnits, filter), selectedUnitId: null })
  },
  resetFilter: () => set({ filter: DEFAULT_FILTER, matchCounts: countMatches(get().allUnits, DEFAULT_FILTER) }),
  toggleCompare: (id) => {
    const cur = get().compareIds
    set({ compareIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-MAX_COMPARE) })
  },
  clearCompare: () => set({ compareIds: [], compareOpen: false }),
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  setShowBus: (showBus) => set({ showBus }),
  setBusSim: (busSim) => set({ busSim }),
  runViewshed: async () => {
    const st = get()
    const c = st.communities.find((x) => x.id === st.selectedCommunityId)
    const u = st.units.find((x) => x.id === st.selectedUnitId)
    const floor = st.floorFilter ?? (u ? { tower: u.tower, level: u.level } : null)
    if (!c || !floor) return
    set({ viewshedBusy: true, buildingViewId: null })
    try {
      // 觀察點高度：BIM 取該層樓板高度；量體以樓高推算；再加眼高 1.5 公尺
      let floorZ = (floor.level - 1) * (c.massing?.floorHeight ?? 3.2)
      let center = c.lngLat
      let excludeM = 35
      if (c.model?.kind === 'upload') {
        // 上傳 GLB：以每層樓高推算，觀察點在錨點（底面中心）
        const { floorElevation } = await import('@/utils/uploadModel')
        floorZ = floorElevation(c.model, floor.level).z
        center = c.model.anchor
        excludeM = Math.max(35, Math.max(...(c.model.size ?? [60, 60]).slice(0, 2)) / 2 + 8)
      } else if (c.model) {
        const m = await api.getModelManifest(c.model.manifestUrl)
        const f = m.floors.find((x) => x.tower === floor.tower && x.level === floor.level)
        if (f) floorZ = c.model.altitude + f.minY // manifest 的 minY 已是該層實際高度
        // 觀察點放在模型平面中心（雙塔占原點以東約 83 m、以北約 44 m）
        const [ax, ay] = c.model.anchor
        center = [ax + 41.5 / (111320 * Math.cos((ay * Math.PI) / 180)), ay + 22 / 110574]
        excludeM = 50
      }
      const eyeH = floorZ + 1.5
      const { computeViewshed } = await import('@/analysis/viewshed')
      const res = await computeViewshed({ center, eyeH, radiusM: st.viewshedRadius, excludeM })
      const tl = c.towers.find((t) => t.id === floor.tower)?.label ?? ''
      const fl = floor.level > 90 ? 'RF' : `${floor.level}F`
      set({ viewshed: { ...res, label: `${c.name} ${tl ? tl + ' ' : ''}${fl}` }, viewshedBusy: false })
      get().flyTo({ bounds: [[res.bounds[0], res.bounds[1]], [res.bounds[2], res.bounds[3]]] })
    } catch (e) {
      console.error(e)
      set({ viewshedBusy: false })
    }
  },
  clearViewshed: () => set({ viewshed: null }),
  setViewshedRadius: (viewshedRadius) => set({ viewshedRadius }),
  setBusSpeed: (busSpeed) => set({ busSpeed }),
  openBuilding: (id, floor) => {
    get().selectCommunity(id, { fly: false, floor: floor ?? null })
    set({ buildingViewId: id })
  },
  closeBuilding: () => set({ buildingViewId: null }),
  setSun: (p) => set({ sun: { ...get().sun, ...p } }),
  setSunStep: (sunStep) => set({ sunStep }),
  clearSunlight: () => set({ sunlight: null, sunStep: null, sunError: null }),
  runSunlight: async () => {
    const st = get()
    const c = st.communities.find((x) => x.id === st.selectedCommunityId)
    if (!c) return
    set({ sunBusy: true, sunError: null, sunStep: null, buildingViewId: null })
    try {
      const [{ computeSunlight }, { sunInputs, communityCenter }, { floorElevation }] = await Promise.all([
        import('@/analysis/sunlight'), import('@/analysis/sunInputs'), import('@/utils/uploadModel'),
      ])
      const p = st.sun
      const mode = p.mode
      // 分層模型的樓層高度（manifest）
      const manifests: Record<string, ModelManifest> = {}
      await Promise.all(st.communities.filter((x) => x.model && x.model.kind !== 'upload').map(async (x) => {
        try { manifests[x.id] = await api.getModelManifest(x.model!.manifestUrl) } catch { /* 無 manifest 時外牆以每 3 公尺分格 */ }
      }))
      const { obstacles, towers } = sunInputs(st.communities, manifests)
      // 區域模式的分析高度
      let heightM = 1.5
      const u = st.units.find((x) => x.id === st.selectedUnitId)
      const floor = st.floorFilter ?? (u ? { tower: u.tower, level: u.level } : null)
      if (mode === 'area' && p.height === 'floor' && floor) {
        if (c.model?.kind === 'upload') heightM = floorElevation(c.model, floor.level).z + 1.5
        else if (manifests[c.id]) heightM = c.model!.altitude + (manifests[c.id].floors.find((f) => f.tower === floor.tower && f.level === floor.level)?.minY ?? 0) + 1.5
        else heightM = (floor.level - 1) * (c.massing?.floorHeight ?? 3.2) + 1.5
      }
      const res = await computeSunlight({ mode, center: communityCenter(c), radiusM: p.radiusM, heightM, date: p.date, start: p.start, end: p.end, stepMin: p.stepMin, obstacles, towers, targetId: c.id })
      set({ sunlight: res, sunBusy: false })
      if (res.bounds) get().flyTo({ bounds: [[res.bounds[0], res.bounds[1]], [res.bounds[2], res.bounds[3]]] })
    } catch (e) {
      console.error(e)
      set({ sunBusy: false, sunError: (e as Error).message })
    }
  },

  loadPoi: async () => {
    if (get().poiReady) return
    try {
      const db = await loadPoiDb()
      set({ poiReady: true, poiMeta: db.meta, poiError: null })
      get().refreshPoi()
    } catch (e) {
      set({ poiError: (e as Error).message })
    }
  },
  refreshPoi: () => {
    const { query, poiQ, poiCats, poiReady, poiSel } = get()
    if (!poiReady || !query) return set({ poiAll: [], poiHits: [] })
    const all = searchPoi(query.center, query.radiusKm, poiQ, null)
    const hits = all.filter((p) => poiCats.has(p.cat))
    const sel = poiSel ? hits.find((p) => p.id === poiSel.id) ?? null : null
    set({ poiAll: all, poiHits: hits, poiSel: sel })
  },
  setPoiQ: (poiQ) => { set({ poiQ }); get().refreshPoi() },
  togglePoiCat: (c, only = false) => {
    const next = only ? new Set<PoiCategory>([c]) : new Set(get().poiCats)
    if (!only) { if (next.has(c)) next.delete(c); else next.add(c) }
    set({ poiCats: next })
    get().refreshPoi()
  },
  selectPoi: (id, fly = true) => {
    const p = id ? get().poiHits.find((x) => x.id === id) ?? null : null
    set({ poiSel: p })
    if (p && fly) get().flyTo({ center: p.lngLat, zoom: 17 })
  },
  setShowPoi: (showPoi) => set({ showPoi }),
}))

export const selectedCommunity = (s: AppState) => s.communities.find((c) => c.id === s.selectedCommunityId) ?? null
export const selectedUnit = (s: AppState) => s.units.find((u) => u.id === s.selectedUnitId) ?? null
