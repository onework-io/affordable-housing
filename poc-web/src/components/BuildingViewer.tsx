// 單棟檢視（three.js）：點選地圖上的 BIM 模型後切換到單一建物，
// 可環繞檢視、依棟別篩選、剖切樓層、分層展開，點樓層即在右側列出該層戶別。
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { selectedCommunity, selectedUnit, useAppStore } from '@/store/useAppStore'
import * as api from '@/services/api'
import { resolveAsset } from '@/utils/assetUrl'
import type { ModelManifest } from '@/types'

const C_BASE = new THREE.Color('#f4f5f2')
const C_PODIUM = new THREE.Color('#e5e7e3')
const C_SEL = new THREE.Color('#10b981')
const C_HOVER = new THREE.Color('#a7f3d0')
const C_SALE = new THREE.Color('#d1fae5')
const EXPLODE_GAP = 2.4 // 分層展開時每層間距（公尺）

interface FloorObj {
  id: string
  tower: string
  level: number
  floor: string
  offsetY: number
  group: THREE.Group
  mat: THREE.MeshStandardMaterial
  lines: THREE.LineSegments[]
}

export default function BuildingViewer() {
  const s = useAppStore()
  const c = selectedCommunity(s)
  const unit = selectedUnit(s)
  const hostRef = useRef<HTMLDivElement>(null)
  const floorsRef = useRef<FloorObj[]>([])
  const ctxRef = useRef<{ renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; controls: OrbitControls; root: THREE.Group; fit: () => void } | null>(null)
  const [progress, setProgress] = useState(0)
  const [ready, setReady] = useState(false)
  const [tower, setTower] = useState<'ALL' | string>('ALL')
  const [cut, setCut] = useState(99)
  const [explode, setExplode] = useState(false)
  const [ghost, setGhost] = useState(true)
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)

  const towers = c?.towers ?? []
  const maxLevel = Math.max(0, ...towers.map((t) => t.toFloor))
  const sel = s.floorFilter ?? (unit ? { tower: unit.tower, level: unit.level } : null)
  const saleByFloor = useMemo(() => {
    const m = new Map<string, number>()
    for (const u of s.units) if (u.status === 'on-sale') m.set(`${u.tower}|${u.level}`, (m.get(`${u.tower}|${u.level}`) ?? 0) + 1)
    return m
  }, [s.units])

  // 建立場景（一次）
  useEffect(() => {
    const host = hostRef.current
    if (!host || !c?.model) return
    let disposed = false
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#eef2f0')
    scene.fog = new THREE.Fog('#eef2f0', 400, 900)
    const camera = new THREE.PerspectiveCamera(40, host.clientWidth / host.clientHeight, 0.5, 3000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.495
    let userMoved = false
    controls.addEventListener('start', () => (userMoved = true))

    scene.add(new THREE.HemisphereLight('#ffffff', '#b7c4bd', 1.6))
    const sun = new THREE.DirectionalLight('#ffffff', 1.6)
    sun.position.set(120, 220, 90)
    scene.add(sun)
    const fill = new THREE.DirectionalLight('#ffffff', 0.5)
    fill.position.set(-150, 80, -120)
    scene.add(fill)

    const grid = new THREE.GridHelper(400, 40, '#9fb3aa', '#d3ddd8')
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.6
    scene.add(grid)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(200, 64), new THREE.MeshBasicMaterial({ color: '#e3ebe7' }))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.05
    scene.add(ground)

    const root = new THREE.Group()
    scene.add(root)
    const lineMat = new THREE.LineBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.55 })

    const fit = () => {
      const box = new THREE.Box3().setFromObject(root)
      if (box.isEmpty()) return
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const r = size.length() / 2 // 外接球半徑
      const vHalf = THREE.MathUtils.degToRad(camera.fov / 2)
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect)
      const dist = (r / Math.sin(Math.min(vHalf, hHalf))) * 1.2
      const dir = new THREE.Vector3(0.62, 0.32, 0.72).normalize()
      controls.target.copy(center)
      camera.position.copy(center).addScaledVector(dir, dist)
      camera.near = r / 100
      camera.far = dist + r * 10
      camera.updateProjectionMatrix()
      controls.update()
    }
    ctxRef.current = { renderer, camera, controls, root, fit }
    if (new URLSearchParams(location.search).has('demo'))
      (window as unknown as { __bv: unknown }).__bv = {
        info: () => {
          const b = new THREE.Box3().setFromObject(root)
          return { min: b.min.toArray(), max: b.max.toArray(), cam: camera.position.toArray(), aspect: camera.aspect, w: host.clientWidth, h: host.clientHeight }
        },
      }

    // 載入：每個 mesh 檔只載一次，各樓層共用幾何
    ;(async () => {
      const manifest: ModelManifest = await api.getModelManifest(c.model!.manifestUrl)
      const loader = new GLTFLoader()
      const geoms = new Map<string, { scene: THREE.Group; edges: Map<THREE.BufferGeometry, THREE.EdgesGeometry> }>()
      let done = 0
      await Promise.all(
        manifest.meshes.map(async (m) => {
          const url = await resolveAsset(c.model!.baseUrl + m.file)
          const gltf = await loader.loadAsync(url)
          const edges = new Map<THREE.BufferGeometry, THREE.EdgesGeometry>()
          gltf.scene.traverse((o) => {
            const mesh = o as THREE.Mesh
            if (mesh.isMesh && !edges.has(mesh.geometry)) edges.set(mesh.geometry, new THREE.EdgesGeometry(mesh.geometry, 30))
          })
          geoms.set(m.id, { scene: gltf.scene, edges })
          done++
          if (!disposed) setProgress(done / manifest.meshes.length)
        }),
      )
      if (disposed) return
      const floors: FloorObj[] = []
      for (const f of manifest.floors) {
        const src = geoms.get(f.mesh)
        if (!src) continue
        const g = src.scene.clone(true)
        const mat = new THREE.MeshStandardMaterial({ color: C_BASE.clone(), roughness: 0.85, metalness: 0, transparent: true, opacity: 1 })
        const lines: THREE.LineSegments[] = []
        g.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          mesh.material = mat
          mesh.userData.floorId = f.id
          const e = src.edges.get(mesh.geometry)
          if (e) {
            const ls = new THREE.LineSegments(e, lineMat)
            ls.raycast = () => {}
            mesh.add(ls)
            lines.push(ls)
          }
        })
        const group = new THREE.Group()
        group.add(g)
        group.position.y = f.offsetY
        root.add(group)
        floors.push({ id: f.id, tower: f.tower, level: f.level, floor: f.floor, offsetY: f.offsetY, group, mat, lines })
      }
      // 置中：底部貼地、平面中心在原點
      const box = new THREE.Box3().setFromObject(root)
      const center = box.getCenter(new THREE.Vector3())
      root.position.set(-center.x, -box.min.y, -center.z)
      floorsRef.current = floors
      fit()
      setReady(true)
    })().catch((e) => console.error('[building]', e))

    // 互動：滑過顯示樓層、點擊選取樓層
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hit = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const vis = floorsRef.current.filter((f) => f.group.visible).map((f) => f.group)
      const h = ray.intersectObjects(vis, true)[0]
      return h ? { id: h.object.userData.floorId as string, x: ev.clientX - rect.left, y: ev.clientY - rect.top } : null
    }
    let down: { x: number; y: number } | null = null
    const onMove = (ev: PointerEvent) => setHover(hit(ev))
    const onDown = (ev: PointerEvent) => (down = { x: ev.clientX, y: ev.clientY })
    const onUp = (ev: PointerEvent) => {
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4) return
      const h = hit(ev)
      const f = h && floorsRef.current.find((x) => x.id === h.id)
      if (f && f.tower !== 'PODIUM') useAppStore.getState().setFloorFilter({ tower: f.tower, level: f.level })
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointerleave', () => setHover(null))

    let raf = 0
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()
    const ro = new ResizeObserver(() => {
      renderer.setSize(host.clientWidth, host.clientHeight)
      camera.aspect = host.clientWidth / host.clientHeight
      camera.updateProjectionMatrix()
      if (!userMoved) fit()
    })
    ro.observe(host)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      ctxRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id])

  // 顯示狀態：棟別、剖切、展開、選取／滑過著色
  useEffect(() => {
    // 分層展開以「該棟第幾層」計算間距（屋頂層的 level 代碼可能很大）
    const rank = new Map<string, number>()
    for (const t of new Set(floorsRef.current.map((f) => f.tower))) {
      floorsRef.current
        .filter((f) => f.tower === t)
        .sort((a, b) => a.level - b.level)
        .forEach((f, i) => rank.set(f.id, i))
    }
    for (const f of floorsRef.current) {
      const isPodium = f.tower === 'PODIUM'
      const visible = (tower === 'ALL' || f.tower === tower || isPodium) && (isPodium || f.level <= cut || (f.level > maxLevel && cut >= maxLevel))
      f.group.visible = visible
      f.group.position.y = f.offsetY + (explode && !isPodium ? (rank.get(f.id) ?? 0) * EXPLODE_GAP : 0)
      const isSel = !!sel && f.tower === sel.tower && f.level === sel.level
      const isHover = hover?.id === f.id
      const onSale = saleByFloor.get(`${f.tower}|${f.level}`) ?? 0
      f.mat.color.copy(isSel ? C_SEL : isHover ? C_HOVER : isPodium ? C_PODIUM : onSale && !sel ? C_SALE : C_BASE)
      const dim = ghost && !!sel && !isSel && !isHover
      f.mat.opacity = dim ? 0.18 : 1
      f.mat.depthWrite = !dim
      for (const l of f.lines) l.visible = !dim
    }
  }, [ready, tower, cut, explode, ghost, sel?.tower, sel?.level, hover?.id, saleByFloor, maxLevel])

  // 分層展開或切換棟別後重新取景
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => ctxRef.current?.fit(), 60)
    return () => clearTimeout(t)
  }, [ready, explode, tower])

  if (!c?.model) return null
  const towerLabel = (id: string) => (id === 'PODIUM' ? '裙樓' : (towers.find((t) => t.id === id)?.label ?? id))
  const hoverInfo = hover && floorsRef.current.find((f) => f.id === hover.id)

  return (
    <div className="absolute inset-0 z-20 overflow-hidden rounded-xl bg-[#eef2f0]" data-testid="building-viewer">
      <div ref={hostRef} className="absolute inset-0" />

      {/* 上方工具列 */}
      <div className="absolute left-3 right-3 top-3 flex flex-wrap items-center gap-2">
        <button className="btn-ghost py-1.5 text-xs shadow-card" data-testid="close-building" onClick={() => s.closeBuilding()}>
          ← 返回圖台
        </button>
        <div className="rounded-lg bg-white/95 px-3 py-1.5 text-sm font-bold text-brand shadow-card">
          單棟檢視 · {c.name}
          <span className="ml-2 text-xs font-normal text-ink-muted">three.js · BIM 分層模型</span>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs shadow-card">
          {[{ id: 'ALL', label: '全部' }, ...towers.map((t) => ({ id: t.id, label: t.label || t.id }))].map((t) => (
            <button key={t.id} data-testid={`bv-tower-${t.id}`} className={`px-2.5 py-1.5 font-medium ${tower === t.id ? 'bg-ink text-white' : 'hover:bg-brand-soft'}`} onClick={() => setTower(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs shadow-card">
          剖切至
          <input data-testid="bv-cut" type="range" min={3} max={maxLevel} value={Math.min(cut, maxLevel)} onChange={(e) => setCut(Number(e.target.value))} className="w-28 accent-brand" />
          <b className="w-8">{Math.min(cut, maxLevel)}F</b>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs shadow-card">
          <input type="checkbox" className="accent-brand" data-testid="bv-explode" checked={explode} onChange={(e) => setExplode(e.target.checked)} />
          分層展開
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs shadow-card">
          <input type="checkbox" className="accent-brand" checked={ghost} onChange={(e) => setGhost(e.target.checked)} />
          其他樓層半透明
        </label>
        <button className="btn-ghost py-1.5 text-xs shadow-card" onClick={() => ctxRef.current?.fit()}>
          重設視角
        </button>
        {sel && (
          <button className="btn-primary py-1.5 text-xs shadow-card" data-testid="bv-viewshed" onClick={() => s.runViewshed()}>
            🔭 從 {towerLabel(sel.tower)} {sel.level > 90 ? 'RF' : `${sel.level}F`} 做視野分析
          </button>
        )}
      </div>

      {/* 樓層索引：每棟一欄，顯示銷售中戶數 */}
      {ready && (
        <div className="absolute bottom-10 right-3 top-16 flex gap-1.5 overflow-y-auto rounded-xl bg-white/95 p-2 shadow-card" data-testid="bv-floor-index">
          {towers
            .filter((t) => tower === 'ALL' || t.id === tower)
            .map((t) => (
              <div key={t.id} className="flex w-14 flex-col gap-0.5">
                <div className="sticky top-0 bg-white pb-1 text-center text-[11px] font-bold">{t.label}</div>
                {Array.from({ length: t.toFloor - t.fromFloor + 1 }, (_, i) => t.toFloor - i).map((lv) => {
                  const n = saleByFloor.get(`${t.id}|${lv}`) ?? 0
                  const on = sel?.tower === t.id && sel.level === lv
                  return (
                    <button
                      key={lv}
                      data-testid={`bv-floor-${t.id}-${lv}`}
                      onClick={() => s.setFloorFilter({ tower: t.id, level: lv })}
                      className={`flex items-center justify-between rounded px-1.5 py-0.5 text-[11px] ${on ? 'bg-brand font-bold text-white' : n ? 'bg-emerald-50 text-ink hover:bg-brand-soft' : 'text-ink-muted hover:bg-slate-100'}`}
                    >
                      <span>{lv}F</span>
                      {n > 0 && <span className={`rounded-full px-1 text-[10px] ${on ? 'bg-white text-brand' : 'bg-rose-500 text-white'}`}>{n}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
        </div>
      )}

      {hoverInfo && hover && (
        <div className="pointer-events-none absolute rounded-md bg-ink/85 px-2 py-1 text-xs text-white" style={{ left: hover.x + 14, top: hover.y + 10 }}>
          {towerLabel(hoverInfo.tower)} {hoverInfo.tower === 'PODIUM' ? '' : hoverInfo.floor}
          {hoverInfo.tower !== 'PODIUM' && ` · 銷售中 ${saleByFloor.get(`${hoverInfo.tower}|${hoverInfo.level}`) ?? 0} 戶`}
        </div>
      )}

      {!ready && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="rounded-xl bg-white px-5 py-3 text-sm shadow-card">載入 BIM 分層模型… {Math.round(progress * 100)}%</div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-slate-700/80 py-1 text-center text-[11px] text-white">
        拖曳旋轉、滾輪縮放、右鍵平移；點樓層或右側樓層索引，右方列出該層戶別。淺綠＝有銷售中戶別。3D 為 PoC 替代模型。
      </div>
    </div>
  )
}
