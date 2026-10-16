// deck.gl 圖層組裝（沿用 TaiwanWarRoom03 composables/buildDeckLayers 的作法：每次狀態變更重建圖層描述）
import { BitmapLayer, IconLayer, LineLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { ViewshedResult } from '@/analysis/viewshed'
import { ScenegraphLayer } from '@deck.gl/mesh-layers'
import { Tile3DLayer } from '@deck.gl/geo-layers'
import { GOOGLE_3DTILES_KEY, GOOGLE_3DTILES_URL, TILESET_URL } from '@/config/map'
import type { Layer, PickingInfo } from '@deck.gl/core'
import type { BusStop, Community, Facility, FacilityCategory, LifeCircleQuery, LifeCircleResult, ModelManifest, Unit, ViewMode } from '@/types'
import { CATEGORY } from '@/config/lifeCircle'
import { circlePolygon, haversine } from '@/utils/geo'

const BRAND: [number, number, number] = [5, 150, 105] // 主色（翠綠）
/** 3D 設施立標高度（公尺） */
const TAG_HEIGHT = 55
const WHITE: [number, number, number] = [248, 248, 246]

const iconCache = new Map<FacilityCategory, string>()
function iconUrl(cat: FacilityCategory) {
  if (!iconCache.has(cat)) {
    const { color, glyph } = CATEGORY[cat]
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="rgb(${color.join(',')})" stroke="white" stroke-width="5"/><text x="32" y="42" font-size="28" text-anchor="middle" fill="white" font-family="PingFang TC, Noto Sans TC, Microsoft JhengHei, sans-serif" font-weight="700">${glyph}</text></svg>`
    iconCache.set(cat, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  }
  return iconCache.get(cat)!
}

/** 公車站牌圖示（藍底白色巴士） */
export const BUS_BLUE: [number, number, number] = [37, 99, 235]
const BUS_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="4" y="4" width="56" height="56" rx="14" fill="rgb(37,99,235)" stroke="white" stroke-width="4"/>' +
    '<rect x="17" y="14" width="30" height="30" rx="5" fill="white"/><rect x="21" y="18" width="22" height="11" rx="2" fill="rgb(37,99,235)"/>' +
    '<circle cx="23" cy="37" r="2.6" fill="rgb(37,99,235)"/><circle cx="41" cy="37" r="2.6" fill="rgb(37,99,235)"/>' +
    '<rect x="19" y="44" width="6" height="6" rx="1.5" fill="white"/><rect x="39" y="44" width="6" height="6" rx="1.5" fill="white"/></svg>',
)}`

export interface FloorDatum {
  communityId: string
  id: string
  tower: string
  level: number
  floor: string
  mesh: string
  offsetY: number
}

export interface LayerContext {
  viewMode: ViewMode
  communities: Community[]
  manifests: Record<string, ModelManifest>
  meshUrls: Record<string, Record<string, string>> // 社區 → mesh id → 可載入的網址
  facilities: Facility[]
  categories: Set<FacilityCategory>
  query: LifeCircleQuery | null
  result: LifeCircleResult | null
  selectedCommunityId: string | null
  selectedUnit: Unit | null
  floorFilter: { tower: string; level: number } | null
  busStops: BusStop[]
  showBus: boolean
  /** 近景（zoom ≥ 16.3）才顯示站牌名稱，避免遠景擁擠 */
  showBusLabels: boolean
  viewshed: (ViewshedResult & { label: string }) | null
}

/**
 * 點選地圖時由 MapView 呼叫（以 overlay.pickObject 主動查詢，比 layer onClick 穩定）。
 * 回傳被點到的社區與樓層；點到空白處回傳 null。
 */
export function resolvePick(info: PickingInfo | null): { communityId: string; floor?: { tower: string; level: number } } | null {
  const id = info?.layer?.id ?? ''
  if (id.startsWith('model-')) {
    const d = info!.object as FloorDatum | undefined
    if (!d) return null
    return { communityId: d.communityId, floor: d.tower === 'PODIUM' ? undefined : { tower: d.tower, level: d.level } }
  }
  if (id.startsWith('massing-') && !id.startsWith('massing-floor-')) {
    const d = info!.object as { id: string } | undefined
    return d ? { communityId: d.id } : null
  }
  return null
}

export function buildLayers(ctx: LayerContext): Layer[] {
  const out: Layer[] = []
  const is3d = ctx.viewMode === '3d'
  const { query, result } = ctx

  // ── 選用：3D Tiles 城市模型（自有 tileset 或 Google 寫實 3D） ─────────────
  if (is3d && (TILESET_URL || GOOGLE_3DTILES_KEY)) {
    out.push(
      new Tile3DLayer({
        id: 'city-3dtiles',
        data: TILESET_URL || GOOGLE_3DTILES_URL,
        loadOptions: GOOGLE_3DTILES_KEY && !TILESET_URL ? { fetch: { headers: { 'X-GOOG-API-KEY': GOOGLE_3DTILES_KEY } } } : {},
        pickable: false,
      }),
    )
  }

  // ── 生活圈（距離圈） ─────────────────────────────
  if (query) {
    out.push(
      new PolygonLayer({
        id: 'life-circle',
        data: [{ polygon: circlePolygon(query.center, query.radiusKm) }],
        getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
        getFillColor: [...BRAND, 26],
        getLineColor: [...BRAND, 230],
        lineWidthMinPixels: 2.5,
        stroked: true,
        filled: true,
        updateTriggers: { getPolygon: [query.radiusKm, query.center.join(',')] },
      }),
      new ScatterplotLayer({
        id: 'life-circle-center',
        data: [query.center],
        getPosition: (d: [number, number]) => d,
        getRadius: 9,
        radiusUnits: 'pixels',
        getFillColor: [255, 255, 255],
        getLineColor: BRAND,
        lineWidthMinPixels: 4,
        stroked: true,
      }),
    )
  }

  // ── 視野分析：可見（綠）／被遮蔽（紅）網格貼地，觀察點以立桿標示高度 ─────────
  if (ctx.viewshed) {
    const v = ctx.viewshed
    const top: [number, number, number] = [v.input.center[0], v.input.center[1], v.input.eyeH]
    out.push(
      new BitmapLayer({ id: 'viewshed-grid', image: v.image, bounds: v.bounds, opacity: 1, textureParameters: { minFilter: 'nearest', magFilter: 'nearest' } }),
      new LineLayer({ id: 'viewshed-pole', data: [0], getSourcePosition: () => [top[0], top[1], 0], getTargetPosition: () => top, getColor: [124, 58, 237, 255], getWidth: 3, widthUnits: 'pixels', parameters: { depthCompare: 'always' } }),
      new ScatterplotLayer({ id: 'viewshed-eye', data: [0], getPosition: () => top, getRadius: 8, radiusUnits: 'pixels', getFillColor: [124, 58, 237, 255], getLineColor: [255, 255, 255, 255], lineWidthMinPixels: 2, stroked: true, parameters: { depthCompare: 'always' } }),
      new TextLayer({
        id: 'viewshed-label',
        data: [0],
        getPosition: () => top,
        getText: () => `🔭 ${v.label}（視高 ${Math.round(v.input.eyeH)} m）`,
        getPixelOffset: [0, -22],
        getSize: 13,
        getColor: [255, 255, 255, 255],
        fontFamily: '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
        fontWeight: 700,
        characterSet: 'auto',
        background: true,
        getBackgroundColor: [124, 58, 237, 235],
        backgroundPadding: [8, 4, 8, 4],
        parameters: { depthCompare: 'always' },
      }),
    )
  }

  // ── 公車站牌（真實位置；圈內清楚、圈外淡化），貼地顯示且不被建物遮住 ─────
  if (ctx.showBus && ctx.busStops.length) {
    const r = query?.radiusKm ?? 0
    const isIn = (b: BusStop) => !!query && haversine(query.center, b.lngLat) <= r
    const busProps = {
      getPosition: (b: BusStop) => b.lngLat,
      getIcon: () => ({ url: BUS_ICON, id: 'bus', width: 64, height: 64 }),
      sizeUnits: 'pixels' as const,
      billboard: true,
      pickable: true,
      parameters: { depthCompare: 'always' as const },
    }
    out.push(
      new IconLayer<BusStop>({ id: 'bus-stops-out', data: ctx.busStops.filter((b) => !isIn(b)), ...busProps, getSize: 17, opacity: 0.6 }),
      new IconLayer<BusStop>({ id: 'bus-stops-in', data: ctx.busStops.filter(isIn), ...busProps, getSize: 26 }),
    )
    if (ctx.showBusLabels)
      out.push(
        new TextLayer<BusStop>({
          id: 'bus-stops-label',
          data: query ? ctx.busStops.filter(isIn) : ctx.busStops,
          getPosition: (b) => b.lngLat,
          getText: (b) => (b.routes.length ? `${b.name}（${b.routes.length} 線）` : b.name),
          getPixelOffset: [0, 22],
          getSize: 11,
          getColor: [30, 58, 138, 255],
          fontFamily: '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
          fontWeight: 600,
          characterSet: 'auto',
          background: true,
          getBackgroundColor: [255, 255, 255, 225],
          backgroundPadding: [4, 1, 4, 1],
          billboard: true,
          parameters: { depthCompare: 'always' },
        }),
      )
  }

  // ── 生活設施（圈內正常顯示，圈外淡化） ─────────────────
  const inside = new Set(result?.facilities.map((f) => f.id))
  const visible = ctx.facilities.filter((f) => ctx.categories.has(f.category))
  const iconProps = {
    getPosition: (f: Facility) => f.lngLat,
    getIcon: (f: Facility) => ({ url: iconUrl(f.category), id: f.category, width: 64, height: 64 }),
    sizeUnits: 'pixels' as const,
    billboard: true,
    pickable: true,
  }
  out.push(
    new IconLayer<Facility>({ id: 'facilities-out', data: visible.filter((f) => !inside.has(f.id)), ...iconProps, getSize: 18, opacity: 0.35 }),
  )

  // 圈內設施：2D 為平面圖示；3D 為立標（地面立桿＋空中圖示＋類別標籤），不被建物遮住
  const inFac = visible.filter((f) => inside.has(f.id))
  if (!is3d) {
    out.push(new IconLayer<Facility>({ id: 'facilities-in', data: inFac, ...iconProps, getSize: 26 }))
  } else {
    const top = (f: Facility): [number, number, number] => [f.lngLat[0], f.lngLat[1], TAG_HEIGHT]
    const color = (f: Facility) => CATEGORY[f.category].color
    out.push(
      new ScatterplotLayer<Facility>({
        id: 'facility-tag-base',
        data: inFac,
        getPosition: (f) => f.lngLat,
        getRadius: 4,
        radiusUnits: 'pixels',
        getFillColor: (f) => [...color(f), 220],
      }),
      new LineLayer<Facility>({
        id: 'facility-tag-stem',
        data: inFac,
        getSourcePosition: (f) => [f.lngLat[0], f.lngLat[1], 0],
        getTargetPosition: top,
        getColor: (f) => [...color(f), 230],
        getWidth: 2.5,
        widthUnits: 'pixels',
      }),
      new IconLayer<Facility>({
        id: 'facility-tag-icon',
        data: inFac,
        ...iconProps,
        getPosition: top,
        getSize: 32,
        parameters: { depthCompare: 'always' },
      }),
      new TextLayer<Facility>({
        id: 'facility-tag-label',
        data: inFac,
        getPosition: top,
        getText: (f) => CATEGORY[f.category].label,
        getPixelOffset: [0, -30],
        getSize: 13,
        getColor: [31, 41, 55, 255],
        fontFamily: '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
        fontWeight: 600,
        characterSet: 'auto',
        background: true,
        getBackgroundColor: [255, 255, 255, 240],
        getBorderColor: (f) => [...color(f), 255],
        getBorderWidth: 1.5,
        backgroundPadding: [6, 3, 6, 3],
        billboard: true,
        parameters: { depthCompare: 'always' },
      }),
    )
  }

  // ── 建物：無 BIM 的社區以量體示意 ─────────────────────
  for (const c of ctx.communities) {
    if (!c.massing) continue
    const selected = ctx.selectedCommunityId === c.id
    const fh = c.massing.floorHeight
    const height = c.floorsAbove * fh
    const hl = selected ? ctx.selectedUnit ?? (ctx.floorFilter ? { level: ctx.floorFilter.level } : null) : null
    out.push(
      new PolygonLayer({
        id: `massing-${c.id}`,
        data: [{ polygon: c.massing.footprint, id: c.id }],
        getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
        extruded: is3d,
        getElevation: height,
        getFillColor: selected ? (hl ? [250, 250, 248, 110] : [...BRAND, 235]) : [...WHITE, 245],
        getLineColor: [180, 180, 180],
        material: { ambient: 0.55, diffuse: 0.6, shininess: 8 },
        pickable: true,
        updateTriggers: { getFillColor: [selected, !!hl] },
      }),
    )
    if (hl && is3d) {
      const base = (hl.level - 1) * fh
      out.push(
        new PolygonLayer({
          id: `massing-floor-${c.id}`,
          data: [{ polygon: c.massing.footprint.map(([x, y]) => [x, y, base]) }],
          getPolygon: (d: { polygon: number[][] }) => d.polygon,
          extruded: true,
          getElevation: fh * 0.92,
          getFillColor: [...BRAND, 255],
          material: { ambient: 0.6, diffuse: 0.6 },
        }),
      )
    }
  }

  // ── 建物：BIM/GLB 分層模型（每層一個 instance，可單獨點選著色） ─────────────
  for (const c of ctx.communities) {
    const m = c.model
    const manifest = ctx.manifests[c.id]
    const urls = ctx.meshUrls[c.id]
    if (!m || !manifest || !urls) continue
    const selected = ctx.selectedCommunityId === c.id
    const u = selected ? ctx.selectedUnit : null
    const hl = u ? { tower: u.tower, level: u.level } : selected ? ctx.floorFilter : null
    const byMesh = new Map<string, FloorDatum[]>()
    for (const f of manifest.floors) {
      if (!byMesh.has(f.mesh)) byMesh.set(f.mesh, [])
      byMesh.get(f.mesh)!.push({ communityId: c.id, ...f })
    }
    const colorOf = (d: FloorDatum): [number, number, number, number] => {
      if (hl) return d.tower === hl.tower && d.level === hl.level ? [16, 185, 129, 255] : [236, 236, 232, 70]
      if (selected) return [...BRAND, 255]
      return [...WHITE, 255]
    }
    for (const mesh of manifest.meshes) {
      out.push(
        new ScenegraphLayer<FloorDatum>({
          id: `model-${c.id}-${mesh.id}`,
          data: byMesh.get(mesh.id) ?? [],
          scenegraph: urls[mesh.id],
          getPosition: () => [m.anchor[0], m.anchor[1], m.altitude],
          getOrientation: () => [0, -m.yaw, 90], // glTF 為 Y 軸朝上
          getTranslation: (d) => [0, 0, d.offsetY],
          sizeScale: 1,
          getColor: colorOf,
          _lighting: 'pbr',
          pickable: true,
          autoHighlight: true,
          highlightColor: [167, 243, 208, 140],
          updateTriggers: { getColor: [selected, hl?.tower, hl?.level] },
        }),
      )
    }
  }

  return out
}
