// 模型定位地圖：拖曳標記調整模型錨點（對應簡報「模型對應預覽」）
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { PACKED_TILES, buildStyle } from '@/config/map'
import { registerPackedTiles } from '@/utils/packedTiles'
import type { LngLat } from '@/types'
import { circlePolygon } from '@/utils/geo'

if (PACKED_TILES) registerPackedTiles()

export function AnchorMap({ value, onChange, radiusM = 45, editable = true }: { value: LngLat; onChange?: (v: LngLat) => void; radiusM?: number; editable?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const cbRef = useRef(onChange)
  cbRef.current = onChange

  useEffect(() => {
    if (!ref.current) return
    const map = new maplibregl.Map({ container: ref.current, style: buildStyle('emap'), center: value, zoom: 17, attributionControl: false })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    const el = document.createElement('div')
    el.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#059669;border:3px solid #fff;box-shadow:0 0 0 2px #059669'
    const marker = new maplibregl.Marker({ element: el, draggable: editable }).setLngLat(value).addTo(map)
    markerRef.current = marker
    const draw = (c: LngLat) => {
      const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [circlePolygon(c, radiusM / 1000, 48)] } }
      const src = map.getSource('fp') as maplibregl.GeoJSONSource | undefined
      if (src) src.setData(data)
      else {
        map.addSource('fp', { type: 'geojson', data })
        map.addLayer({ id: 'fp-fill', type: 'fill', source: 'fp', paint: { 'fill-color': '#059669', 'fill-opacity': 0.15 } })
        map.addLayer({ id: 'fp-line', type: 'line', source: 'fp', paint: { 'line-color': '#059669', 'line-width': 2, 'line-dasharray': [2, 1] } })
      }
    }
    map.on('load', () => draw(value))
    marker.on('drag', () => { const p = marker.getLngLat(); if (map.isStyleLoaded()) draw([p.lng, p.lat]) })
    marker.on('dragend', () => { const p = marker.getLngLat(); cbRef.current?.([+p.lng.toFixed(6), +p.lat.toFixed(6)]) })
    return () => map.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部輸入改變時同步標記
  useEffect(() => {
    const m = markerRef.current
    if (!m) return
    const cur = m.getLngLat()
    if (Math.abs(cur.lng - value[0]) > 1e-7 || Math.abs(cur.lat - value[1]) > 1e-7) {
      m.setLngLat(value)
      mapRef.current?.easeTo({ center: value, duration: 300 })
    }
  }, [value])

  return <div ref={ref} className="h-60 w-full overflow-hidden rounded-lg border border-slate-200" />
}
