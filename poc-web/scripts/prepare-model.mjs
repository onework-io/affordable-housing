// 將 HK 分層 GLB（Draco + 寫實材質）轉成圖台用的「白模」分層 GLB。
//
// 輸入：../assets-src/hk-parts/*.glb（從 HK 專案複製的原始分層檔，不修改）
// 輸出：public/models/hk/*.glb + manifest.json
//
// 處理：
//   1. 解 Draco，只保留 POSITION（法線減面後重算），全部改用單一白色材質，去除貼圖
//   2. 合併 primitive、減面（meshoptimizer）
//   3. 幾何相同的樓層（標準層）只輸出一個 GLB，其餘樓層記錄垂直位移 offsetY，
//      前端用同一個 ScenegraphLayer 做 instancing，每層仍可單獨點選與著色。
//
// 用法：npm run model:prepare   （或 node scripts/prepare-model.mjs <輸入資料夾> <輸出資料夾> [減面比例] [誤差]）

import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, join, normals, prune, simplify, unweld, weld } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import draco3d from 'draco3dgltf'
import { mkdirSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join as pjoin, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = process.argv[2] ?? pjoin(here, '../../assets-src/hk-parts')
const OUT = process.argv[3] ?? pjoin(here, '../public/models/hk')
const RATIO = Number(process.argv[4] ?? 0.2)
const ERROR = Number(process.argv[5] ?? 0.01)

if (!existsSync(SRC)) {
  console.error(`找不到輸入資料夾：${SRC}`)
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })
await MeshoptSimplifier.ready

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
})

// T1_12F → { tower: 'T1', floor: '12F', level: 12 }；2F → 裙樓
function parseId(id) {
  const m = id.match(/^(T\d+)_(\d+F|RF)$/i)
  if (m) {
    const floor = m[2].toUpperCase()
    return { tower: m[1].toUpperCase(), floor, level: floor === 'RF' ? 99 : parseInt(floor, 10) }
  }
  return { tower: 'PODIUM', floor: id.toUpperCase(), level: parseInt(id, 10) || 0 }
}

const r = (v) => Math.round(v * 20) / 20 // 5 cm 容差

async function load(file) {
  const doc = await io.read(pjoin(SRC, file))
  const root = doc.getRoot()
  let tris = 0
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices()
      tris += idx ? idx.getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3
    }
  const b = getBounds(root.getDefaultScene())
  return { doc, tris, b }
}

// 第一輪：讀取並依「面數 + 平面範圍 + 樓高」分組
const files = readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.glb')).sort()
const floors = []
for (const f of files) {
  const id = basename(f, '.glb')
  const { tris, b } = await load(f)
  const key = [tris, r(b.min[0]), r(b.min[2]), r(b.max[0]), r(b.max[2]), r(b.max[1] - b.min[1])].join('|')
  floors.push({ id, file: f, key, tris, minY: b.min[1], maxY: b.max[1], ...parseId(id) })
}

const groups = new Map()
for (const fl of floors) {
  if (!groups.has(fl.key)) groups.set(fl.key, [])
  groups.get(fl.key).push(fl)
}

// 第二輪：每組只輸出一個白模 GLB
const manifest = {
  source: 'HK 專案 OC/3d/parts（PoC 替代模型，非本案建物）',
  units: 'meter',
  upAxis: 'Y',
  meshes: [],
  floors: [],
}
for (const members of groups.values()) {
  members.sort((a, b) => a.minY - b.minY)
  const base = members[0]
  const meshId = members.length > 1 ? `${base.tower}_typ_${base.floor}` : base.id
  const { doc } = await load(base.file)
  const root = doc.getRoot()
  const mat = doc.createMaterial('massing').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.9)
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) {
      for (const sem of prim.listSemantics()) if (sem !== 'POSITION') prim.setAttribute(sem, null) // 法線之後重算
      prim.setMaterial(mat)
    }
  for (const ext of root.listExtensionsUsed()) ext.dispose()
  // 先去掉法線再 weld，減面才不會被硬邊卡住；減面後 unweld + 重算法線 → 平面著色的量體
  await doc.transform(prune(), dedup(), join(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: ERROR }), unweld(), normals({ overwrite: true }), prune())

  let tris = 0
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) tris += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3
  const out = pjoin(OUT, `${meshId}.glb`)
  await io.write(out, doc)
  const bytes = statSync(out).size
  manifest.meshes.push({ id: meshId, file: `${meshId}.glb`, bytes, tris, sourceTris: base.tris, usedBy: members.length })
  for (const m of members)
    manifest.floors.push({
      id: m.id, tower: m.tower, floor: m.floor, level: m.level,
      mesh: meshId, offsetY: +(m.minY - base.minY).toFixed(3),
      minY: +m.minY.toFixed(2), maxY: +m.maxY.toFixed(2),
    })
  console.log(`${meshId.padEnd(14)} ${(bytes / 1024).toFixed(0).padStart(6)} KB  ${base.tris}→${tris} tris  ×${members.length}`)
}

manifest.floors.sort((a, b) => a.tower.localeCompare(b.tower) || a.level - b.level)
manifest.totalBytes = manifest.meshes.reduce((s, m) => s + m.bytes, 0)
writeFileSync(pjoin(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`\n${manifest.floors.length} 層 → ${manifest.meshes.length} 個 GLB，共 ${(manifest.totalBytes / 1024 / 1024).toFixed(1)} MB`)
