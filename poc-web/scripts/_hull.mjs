import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const out = {}
for (const id of process.argv.slice(2)) {
  const doc = await io.read(`public/models/hk/${id}.glb`)
  const pts = []
  let ymin = 1e9, ymax = -1e9
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue
    const M = node.getWorldMatrix()
    for (const prim of mesh.listPrimitives()) {
      const a = prim.getAttribute('POSITION'); const v = [0,0,0]
      for (let i = 0; i < a.getCount(); i++) {
        a.getElement(i, v)
        const x = M[0]*v[0]+M[4]*v[1]+M[8]*v[2]+M[12], y = M[1]*v[0]+M[5]*v[1]+M[9]*v[2]+M[13], z = M[2]*v[0]+M[6]*v[1]+M[10]*v[2]+M[14]
        pts.push([x, -z]); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y)
      }
    }
  }
  // convex hull (monotone chain)
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cr = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
  const lo = [], up = []
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length-2], lo[lo.length-1], p) <= 0) lo.pop(); lo.push(p) }
  for (const p of pts.reverse()) { while (up.length >= 2 && cr(up[up.length-2], up[up.length-1], p) <= 0) up.pop(); up.push(p) }
  const hull = lo.slice(0, -1).concat(up.slice(0, -1)).map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)])
  out[id] = { n: pts.length, ymin: +ymin.toFixed(2), ymax: +ymax.toFixed(2), hull }
}
console.log(JSON.stringify(out))
