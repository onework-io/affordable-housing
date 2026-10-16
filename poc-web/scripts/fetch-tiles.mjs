// 下載國土測繪中心圖磚，打包成 public/tiles/<圖層>/z<縮放>.json（base64），供離線／展示版使用。
// 需連網，在自己電腦執行：npm run tiles:fetch
// 圖資：內政部國土測繪中心（政府資料開放授權），使用時須標示出處。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TILE_PLAN, BBOX, tilesFor, tileUrl } from './tile-plan.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/tiles')
const CONCURRENCY = 6

async function pool(items, fn) {
  let i = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (i < items.length) await fn(items[i++]) }))
}

const index = { source: '內政部國土測繪中心 WMTS', fetchedAt: new Date().toISOString(), bbox: BBOX, layers: {} }
for (const layer of Object.keys(TILE_PLAN)) {
  mkdirSync(join(OUT, layer), { recursive: true })
  index.layers[layer] = { zooms: {} }
  for (const z of Object.keys(TILE_PLAN[layer].zooms).map(Number)) {
    const list = tilesFor(layer, z)
    const tiles = {}
    let failed = 0
    await pool(list, async ([x, y]) => {
      try {
        const r = await fetch(tileUrl(layer, z, x, y))
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        tiles[`${x}/${y}`] = Buffer.from(await r.arrayBuffer()).toString('base64')
      } catch { failed++ }
    })
    writeFileSync(join(OUT, layer, `z${z}.json`), JSON.stringify({ layer, z, mime: 'image/jpeg', tiles }))
    index.layers[layer].zooms[z] = Object.keys(tiles).length
    console.log(`${layer} z${z}: ${Object.keys(tiles).length}/${list.length}${failed ? `（失敗 ${failed}）` : ''}`)
  }
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2))
console.log('完成 →', OUT)
