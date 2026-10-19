// 上傳 GLB 預覽（three.js）：套用上軸與單位，顯示 10 m 格網、量測包圍盒與三角面數
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Bounds } from '@/utils/uploadModel'

export interface ModelStats { bounds: Bounds; tris: number; meshes: number; materials: number }

export default function ModelPreview({ url, upAxis, scale, onStats, onError }: { url: string; upAxis: 'Y' | 'Z'; scale: number; onStats: (s: ModelStats) => void; onError: (msg: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{ holder: THREE.Group; refit: () => void } | null>(null)
  const cb = useRef({ onStats, onError })
  cb.current = { onStats, onError }

  useEffect(() => {
    const el = ref.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f1f5f9')
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9ca3af, 2.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(80, 140, 60)
    scene.add(sun)
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 20000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    const holder = new THREE.Group() // 套用上軸 / 單位
    scene.add(holder)
    let grid: THREE.GridHelper | null = null
    const refit = () => {
      const box = new THREE.Box3().setFromObject(holder)
      if (box.isEmpty()) return
      const sph = box.getBoundingSphere(new THREE.Sphere())
      const r = Math.max(sph.radius, 1)
      const fov = (camera.fov * Math.PI) / 180
      const dist = (r / Math.sin(Math.min(fov, fov * camera.aspect) / 2)) * 1.1
      camera.position.copy(sph.center).add(new THREE.Vector3(1, 0.75, 1.1).normalize().multiplyScalar(dist))
      camera.near = dist / 100
      camera.far = dist * 20
      camera.updateProjectionMatrix()
      controls.target.copy(sph.center)
      if (grid) scene.remove(grid)
      const size = Math.ceil((r * 2.4) / 10) * 10
      grid = new THREE.GridHelper(size, size / 10, 0x94a3b8, 0xcbd5e1)
      grid.position.set(sph.center.x, box.min.y, sph.center.z)
      scene.add(grid)
    }
    sceneRef.current = { holder, refit }
    let raf = 0
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [])

  // 載入模型
  useEffect(() => {
    const ctx = sceneRef.current
    if (!ctx) return
    let cancelled = false
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (cancelled) return
        ctx.holder.clear()
        const root = gltf.scene
        root.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(root)
        let tris = 0, meshes = 0
        const mats = new Set<string>()
        root.traverse((o) => {
          const m = o as THREE.Mesh
          if (!m.isMesh) return
          meshes++
          const g = m.geometry
          tris += (g.index ? g.index.count : g.attributes.position.count) / 3
          ;(Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x.uuid))
        })
        ctx.holder.add(root)
        cb.current.onStats({ bounds: [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z], tris: Math.round(tris), meshes, materials: mats.size })
        ctx.refit()
      },
      undefined,
      (e) => !cancelled && cb.current.onError(`模型讀取失敗：${(e as Error)?.message ?? e}`),
    )
    return () => {
      cancelled = true
    }
  }, [url])

  // 上軸 / 單位
  useEffect(() => {
    const ctx = sceneRef.current
    if (!ctx) return
    ctx.holder.rotation.set(upAxis === 'Z' ? -Math.PI / 2 : 0, 0, 0)
    ctx.holder.scale.setScalar(scale)
    ctx.holder.updateMatrixWorld(true)
    ctx.refit()
  }, [upAxis, scale, url])

  return <div ref={ref} data-testid="glb-preview" className="h-56 w-full overflow-hidden rounded-lg border border-slate-200" />
}
