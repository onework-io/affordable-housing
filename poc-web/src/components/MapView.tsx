// 2D/3D 圖台：MapLibre（底圖 + 白模城市）+ deck.gl overlay（生活圈、設施、BIM 模型）
// 架構沿用 TaiwanWarRoom03 MapView：同一地圖實例以 pitch 切換 2D/3D，狀態集中於 store。
import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { AmbientLight, DirectionalLight, LightingEffect, type PickingInfo } from '@deck.gl/core'
import { BASEMAPS, EXTRUSION_LAYERS, HAS_3DTILES, INITIAL_VIEW, OVERLAYS, PACKED_TILES, USE_BASEMAP, VIEW_3D, buildStyle, type BasemapId, type OverlayId } from '@/config/map'
import { registerPackedTiles } from '@/utils/packedTiles'

if (PACKED_TILES) registerPackedTiles()
import { CATEGORY } from '@/config/lifeCircle'
import { isFilterActive } from '@/config/filters'
import { selectedUnit, useAppStore } from '@/store/useAppStore'
import { buildLayers, resolvePick } from './buildLayers'
import { getModelUrl } from '@/utils/modelStore'
import * as api from '@/services/api'
import type { BusStop, Facility, ModelManifest } from '@/types'
import { fmtKm, haversine } from '@/utils/geo'
import { busLayers, loadBuses, positions, type Bus, type BusState } from '@/sim/busSim'
const DEMO = import.meta.env.DEV || new URLSearchParams(location.search).has('demo')
import { resolveAsset } from '@/utils/assetUrl'

const lighting = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.6 }),
  sun: new DirectionalLight({ color: [255, 248, 236], intensity: 2.2, direction: [-0.5, -0.9, -1] }),
})

function cardHtml(name: string, address: string, total: number, onSale: number, dist?: number, matched?: number) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)
  return `<div class="box"><div class="title">${esc(name)}<span class="cmp-tag">· 比較中</span></div><div class="addr">${esc(address)}</div>
  <div>社區 ${total} 戶 ／ 售 <span class="num">${onSale}</span> 戶</div>
  ${matched !== undefined ? `<div class="match">符合條件 <span class="num">${matched}</span> 戶</div>` : ''}
  ${dist !== undefined ? `<div class="dist">距中心 ${fmtKm(dist)}</div>` : ''}</div><div class="pin"></div>`
}

function busPopup(b: BusStop) {
  const el = document.createElement('div')
  el.className = 'text-xs leading-relaxed'
  el.dataset.testid = 'bus-popup'
  const t = document.createElement('div')
  t.className = 'mb-1 text-sm font-bold'
  t.style.color = 'rgb(37,99,235)'
  t.textContent = `🚌 ${b.name}`
  el.appendChild(t)
  const q = useAppStore.getState().query
  if (q) {
    const d = document.createElement('div')
    d.className = 'text-ink-muted'
    d.textContent = `距生活圈中心 ${fmtKm(haversine(q.center, b.lngLat))}`
    el.appendChild(d)
  }
  if (!b.routes.length) {
    const n = document.createElement('div')
    n.className = 'mt-1 text-ink-muted'
    n.textContent = '路線資料未對應到此站牌'
    el.appendChild(n)
  } else {
    const h = document.createElement('div')
    h.className = 'mt-1 font-semibold'
    h.textContent = `經過路線 ${b.routes.length} 條`
    el.appendChild(h)
    const ul = document.createElement('div')
    ul.className = 'mt-0.5 max-h-40 space-y-0.5 overflow-y-auto pr-1'
    for (const r of b.routes) {
      const row = document.createElement('div')
      const code = document.createElement('span')
      code.className = 'mr-1.5 inline-block min-w-[38px] rounded px-1 text-center font-semibold text-white'
      code.style.background = 'rgb(37,99,235)'
      code.textContent = r.code
      row.appendChild(code)
      row.appendChild(document.createTextNode(`${r.from} → ${r.to}`))
      ul.appendChild(row)
    }
    el.appendChild(ul)
  }
  const src = document.createElement('div')
  src.className = 'mt-1.5 text-[10px] text-ink-faint'
  src.textContent = '站牌位置 © OpenStreetMap；路線：桃園市公車動態資訊系統（2017），代碼為系統路線代碼'
  el.appendChild(src)
  return el
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const useOverlayState = useRef<Record<OverlayId, boolean>>(Object.fromEntries(OVERLAYS.map((o) => [o.id, o.defaultOn])) as Record<OverlayId, boolean>)
  const markersRef = useRef<Map<string, { marker: maplibregl.Marker; el: HTMLDivElement }>>(new Map())
  const [manifests, setManifests] = useState<Record<string, ModelManifest>>({})
  const [meshUrls, setMeshUrls] = useState<Record<string, Record<string, string>>>({})
  const [uploadUrls, setUploadUrls] = useState<Record<string, string>>({})
  const [basemap, setBasemap] = useState<BasemapId>('emap')
  const [near, setNear] = useState(false)
  const busHighlightRef = useRef<string | null>(null)
  const [buses, setBuses] = useState<Bus[]>([])
  const [overlays, setOverlays] = useState<Record<OverlayId, boolean>>(
    () => Object.fromEntries(OVERLAYS.map((o) => [o.id, o.defaultOn])) as Record<OverlayId, boolean>,
  )

  const s = useAppStore()
  const unit = selectedUnit(s)

  // 建立地圖（一次）
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle('emap'),
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      pitch: INITIAL_VIEW.pitch,
      bearing: INITIAL_VIEW.bearing,
      maxPitch: 75,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    // 開發模式或網址帶 ?demo（錄製操作影片用）時開放地圖物件
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('demo')) (window as unknown as { __map: maplibregl.Map }).__map = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    // 個別圖磚失敗（離線、超出範圍）只記錄，不影響資料圖層
    map.on('error', (e) => console.warn('[map]', e.error?.message ?? e))

    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      effects: [lighting],
      getTooltip: (info: PickingInfo) => {
        if (info.layer?.id.startsWith('bus-3d') && info.object) {
          const r = (info.object as BusState).bus.route
          return { text: `🚌 路線代碼 ${r.code}\n${r.from} ↔ ${r.to}\n模擬行駛（非即時位置）・點選看路線` }
        }
        if (info.layer?.id.startsWith('bus-stops') && info.object) {
          const b = info.object as BusStop
          return { text: `🚌 ${b.name}\n${b.routes.length ? `經過 ${b.routes.length} 條路線（點選查看）` : '路線資料未對應'}` }
        }
        const f = info.object as Facility | undefined
        if (!f || !('category' in f)) return null
        const q = useAppStore.getState().query
        const d = q ? ` · 距中心 ${fmtKm(haversine(q.center, f.lngLat))}` : ''
        return { text: `${f.name}\n${CATEGORY[f.category].label}${d}` }
      },
    })
    overlayRef.current = overlay
    map.addControl(overlay as unknown as maplibregl.IControl)

    // 遠景時標籤卡精簡，避免互相遮擋
    const compact = () => containerRef.current?.classList.toggle('cards-compact', map.getZoom() < 14.8)
    map.on('zoom', compact)
    compact()
    const nearCheck = () => setNear(map.getZoom() >= 16)
    map.on('zoomend', nearCheck)
    nearCheck()

    map.on('click', (e) => {
      const st = useAppStore.getState()
      if (st.pickingPoint) return st.setCenterPoint([e.lngLat.lng, e.lngLat.lat])
      const picked = overlay.pickObject({ x: e.point.x, y: e.point.y, radius: 4 })
      // 動態公車：標出整條路線
      if (picked?.layer?.id.startsWith('bus-3d') && picked.object) {
        const r = (picked.object as BusState).bus.route
        busHighlightRef.current = r.code
        const el = document.createElement('div')
        el.className = 'text-xs leading-relaxed'
        el.innerHTML = ''
        const t = document.createElement('div')
        t.className = 'text-sm font-bold'
        t.textContent = `🚌 路線代碼 ${r.code}`
        const d = document.createElement('div')
        d.textContent = `${r.from} ↔ ${r.to}`
        const m = document.createElement('div')
        m.className = 'text-ink-muted'
        m.textContent = `本範圍內行駛 ${r.km} 公里 · 停靠 ${r.stops} 站`
        const n = document.createElement('div')
        n.className = 'mt-1 text-[10px] text-ink-faint'
        n.textContent = '模擬行駛：依 2017 路線站序與 OSM 路網推算，非即時位置'
        el.append(t, d, m, n)
        new maplibregl.Popup({ closeButton: true, maxWidth: '260px' }).setLngLat(e.lngLat).setDOMContent(el).addTo(map).on('close', () => (busHighlightRef.current = null))
        return
      }
      busHighlightRef.current = null
      // 公車站牌：顯示站名與經過路線
      if (picked?.layer?.id.startsWith('bus-stops') && picked.object) {
        const b = picked.object as BusStop
        new maplibregl.Popup({ closeButton: true, maxWidth: '300px' }).setLngLat(b.lngLat).setDOMContent(busPopup(b)).addTo(map)
        return
      }
      // 點建物：BIM 模型可點到樓層，量體只到社區
      const hit = resolvePick(picked)
      // 點 BIM 模型：切換到單棟檢視（three.js）；量體仍只選取社區
      if (hit && picked?.layer?.id.startsWith('model-')) return st.openBuilding(hit.communityId, hit.floor ?? null)
      if (hit) return st.selectCommunity(hit.communityId, { fly: st.selectedCommunityId !== hit.communityId, floor: hit.floor ?? null })
      // 桃園市社區範圍：顯示社區基本資料
      if (map.getLayer('ty-community-fill') && map.getLayoutProperty('ty-community-fill', 'visibility') !== 'none') {
        const f = map.queryRenderedFeatures(e.point, { layers: ['ty-community-fill'] })[0]
        if (f) {
          const p = f.properties as Record<string, string>
          const el = document.createElement('div')
          el.className = 'text-xs leading-relaxed'
          const rows: [string, string | undefined][] = [['地址', p.Address], ['戶數', p.Households && `${p.Households} 戶`], ['樓層', p.Floor && `${p.Floor} 層`], ['用途', p.BUse], ['構造', p.BStruct]]
          const title = document.createElement('div')
          title.className = 'mb-1 text-sm font-bold text-brand'
          title.textContent = p.Name || '社區'
          el.appendChild(title)
          for (const [k, v] of rows) {
            if (!v) continue
            const row = document.createElement('div')
            row.textContent = `${k}：${v}`
            el.appendChild(row)
          }
          const src = document.createElement('div')
          src.className = 'mt-1 text-[10px] text-ink-faint'
          src.textContent = '資料：桃園市政府地政局'
          el.appendChild(src)
          new maplibregl.Popup({ closeButton: true, maxWidth: '260px' }).setLngLat(e.lngLat).setDOMContent(el).addTo(map)
        }
      }
    })

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // 載入各社區的模型 manifest
  useEffect(() => {
    for (const c of s.communities) {
      if (!c.model || c.model.kind === 'upload' || manifests[c.id]) continue
      const base = c.model.baseUrl
      api
        .getModelManifest(c.model.manifestUrl)
        .then(async (m) => {
          const urls = await Promise.all(m.meshes.map((mesh) => resolveAsset(base + mesh.file)))
          setMeshUrls((prev) => ({ ...prev, [c.id]: Object.fromEntries(m.meshes.map((mesh, i) => [mesh.id, urls[i]])) }))
          setManifests((prev) => ({ ...prev, [c.id]: m }))
        })
        .catch(console.error)
    }
  }, [s.communities, manifests])

  // 後台上傳的 GLB（IndexedDB → blob URL）
  useEffect(() => {
    for (const c of s.communities) {
      const key = c.model?.kind === 'upload' ? c.model.uploadKey : null
      if (!key || uploadUrls[c.id]) continue
      getModelUrl(key)
        .then((url) => url && setUploadUrls((prev) => ({ ...prev, [c.id]: url })))
        .catch(console.error)
    }
  }, [s.communities, uploadUrls])

  // 圖層
  const layers = useMemo(
    () =>
      buildLayers({
        viewMode: s.viewMode,
        communities: s.communities,
        manifests,
        meshUrls,
        facilities: s.facilities,
        categories: s.categories,
        query: s.query,
        result: s.result,
        selectedCommunityId: s.selectedCommunityId,
        selectedUnit: unit,
        floorFilter: s.floorFilter,
        busStops: s.busStops,
        showBus: s.showBus,
        showBusLabels: near,
        viewshed: s.viewshed,
        uploadUrls,
      }),
    [s.viewMode, s.communities, manifests, meshUrls, uploadUrls, s.facilities, s.categories, s.query, s.result, s.selectedCommunityId, unit, s.floorFilter, s.busStops, s.showBus, near, s.viewshed],
  )
  // 動態公車（模擬）：每一幀只重算公車圖層，其餘圖層沿用
  useEffect(() => {
    if (s.busSim && !buses.length) loadBuses().then(setBuses).catch(console.error)
  }, [s.busSim, buses.length])
  const speedRef = useRef(s.busSpeed)
  speedRef.current = s.busSpeed
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    if (!s.busSim || !buses.length) {
      overlay.setProps({ layers })
      return
    }
    let raf = 0
    let last = performance.now()
    let simT = (window as unknown as { __busT?: number }).__busT ?? 8 * 3600
    let lastDraw = 0
    const tick = (now: number) => {
      simT += ((now - last) / 1000) * speedRef.current
      last = now
      ;(window as unknown as { __busT?: number }).__busT = simT
      if (now - lastDraw > 33) {
        lastDraw = now
        const zoom = mapRef.current?.getZoom() ?? 16
        overlay.setProps({ layers: [...layers, ...busLayers(buses, simT, zoom, busHighlightRef.current)] })
        if (DEMO) (window as unknown as { __busPos?: unknown }).__busPos = () => positions(buses, simT).map((d) => d.pos)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [layers, s.busSim, buses])

  // 社區標籤卡（HTML Marker）
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const inCircle = new Map(s.result?.communities.map((c) => [c.id, c.distanceKm]))
    for (const c of s.communities) {
      const total = c.towers.reduce((n, t) => n + (t.toFloor - t.fromFloor + 1) * t.unitCodes.length, 0)
      const onSale = s.onSaleCounts[c.id] ?? 0
      let entry = markersRef.current.get(c.id)
      if (!entry) {
        const el = document.createElement('div')
        el.className = 'community-card'
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          useAppStore.getState().selectCommunity(c.id)
        })
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(c.lngLat).addTo(map)
        entry = { marker, el }
        markersRef.current.set(c.id, entry)
      }
      const hidden = s.onlyOnSale && onSale === 0
      entry.el.style.display = hidden ? 'none' : ''
      const fActive = isFilterActive(s.filter)
      const matched = fActive ? (s.matchCounts[c.id] ?? 0) : undefined
      entry.el.innerHTML = cardHtml(c.name, c.address, total, onSale, inCircle.get(c.id), matched)
      entry.el.classList.toggle('cmp', s.compareIds.includes(c.id))
      const active = s.selectedCommunityId === c.id
      entry.el.classList.toggle('active', active)
      // 選取中的社區：標籤卡移到建物左側，不擋住 3D 模型
      entry.marker.setOffset(active ? [-150, -20] : [0, 0])
      entry.el.classList.toggle('dim', ((!!s.result && !inCircle.has(c.id)) || matched === 0) && s.selectedCommunityId !== c.id)
    }
  }, [s.communities, s.onSaleCounts, s.result, s.selectedCommunityId, s.onlyOnSale, s.filter, s.matchCounts, s.compareIds])

  // 2D / 3D 切換
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const is3d = s.viewMode === '3d'
    map.easeTo({ pitch: is3d ? VIEW_3D.pitch : 0, bearing: is3d ? VIEW_3D.bearing : 0, duration: 700 })
    const apply = () => {
      for (const id of EXTRUSION_LAYERS) {
        if (!map.getLayer(id)) continue
        const overlay = OVERLAYS.find((o) => o.layers.includes(id))
        const on = is3d && !HAS_3DTILES && (overlay ? useOverlayState.current[overlay.id] : true)
        map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
  }, [s.viewMode])

  // 參考圖層開關（桃園市 3D 建物、社區範圍、地籍圖）
  useEffect(() => {
    useOverlayState.current = overlays
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const is3d = useAppStore.getState().viewMode === '3d'
      for (const o of OVERLAYS)
        for (const id of o.layers) {
          if (!map.getLayer(id)) continue
          const on = overlays[o.id] && (!EXTRUSION_LAYERS.includes(id) || (is3d && !HAS_3DTILES))
          map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
        }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
  }, [overlays])

  // 底圖切換：電子地圖 / 正射影像
  useEffect(() => {
    const map = mapRef.current
    if (!map || !USE_BASEMAP) return
    const apply = () => {
      for (const id of Object.keys(BASEMAPS) as BasemapId[])
        if (map.getLayer(`basemap-${id}`)) map.setLayoutProperty(`basemap-${id}`, 'visibility', id === basemap ? 'visible' : 'none')
    }
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
  }, [basemap])

  // 飛行 / 縮放到範圍
  useEffect(() => {
    const map = mapRef.current
    const f = s.fly
    if (!map || !f) return
    if (f.bounds) map.fitBounds(f.bounds, { padding: { top: 60, bottom: 60, left: 60, right: 60 }, pitch: map.getPitch(), bearing: map.getBearing(), duration: 900 })
    else if (f.center) map.flyTo({ center: f.center, zoom: f.zoom ?? 16, duration: 1100, essential: true })
  }, [s.fly])

  // 指定地圖位置模式：游標
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = s.pickingPoint ? 'crosshair' : ''
  }, [s.pickingPoint])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute right-3 top-3 flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
        {(['2d', '3d'] as const).map((m) => (
          <button
            key={m}
            data-testid={`view-${m}`}
            onClick={() => s.setViewMode(m)}
            className={`px-3 py-1.5 text-sm font-semibold ${s.viewMode === m ? 'bg-brand text-white' : 'text-ink hover:bg-brand-soft'}`}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {s.pickingPoint && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-ink/85 px-4 py-1.5 text-sm text-white shadow-card">
          點選地圖指定中心點（例如工作地點、學校）
        </div>
      )}

      {OVERLAYS.length > 0 && (
        <div className="absolute left-3 top-12 space-y-1 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-2 text-xs shadow-card">
          {OVERLAYS.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-brand"
                data-testid={`overlay-${o.id}`}
                checked={overlays[o.id]}
                onChange={(e) => setOverlays((prev) => ({ ...prev, [o.id]: e.target.checked }))}
              />
              {o.label}
            </label>
          ))}
          <div className="pt-0.5 text-[10px] text-ink-faint">桃園市圖層 zoom ≥ 16 顯示</div>
        </div>
      )}
      {PACKED_TILES && (
        <div className="pointer-events-none absolute bottom-10 left-3 rounded-md bg-white/90 px-2 py-1 text-[11px] text-ink-muted shadow-card">展示版：底圖與 3D 建物為預先打包的桃園區範圍（桃園市圖層僅供內部展示）</div>
      )}
      {USE_BASEMAP ? (
        <div className="absolute left-3 top-3 flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs shadow-card">
          {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
            <button
              key={id}
              data-testid={`basemap-${id}`}
              onClick={() => setBasemap(id)}
              className={`px-2.5 py-1.5 font-medium ${basemap === id ? 'bg-ink text-white' : 'text-ink hover:bg-brand-soft'}`}
            >
              {BASEMAPS[id].label}
            </button>
          ))}
        </div>
      ) : (
        <div className="absolute left-3 top-3 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 shadow-card">展示版未載入底圖與周邊白模（需連網的本機版才有）</div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-slate-700/80 py-1 text-center text-[11px] text-white">
        社區資料查詢日 115.10.07（示範資料）；3D 為 PoC 替代模型，生活圈為距離圈示意，不代表實際可達時間。
      </div>
    </div>
  )
}
