// 將建置輸出中的二進位資產（.glb .exr）轉成 base64 JSON，供只接受文字／網頁型別的發佈環境使用。
// 用法：node scripts/pack-assets.mjs dist-artifact
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'

const MIME = { '.glb': 'model/gltf-binary', '.exr': 'image/x-exr' }
const root = process.argv[2] ?? 'dist-artifact'

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (MIME[extname(p).toLowerCase()]) {
      const buf = readFileSync(p)
      writeFileSync(`${p}.json`, JSON.stringify({ mime: MIME[extname(p).toLowerCase()], base64: buf.toString('base64') }))
      unlinkSync(p)
      console.log(`packed ${p} (${(buf.length / 1024).toFixed(0)} KB)`)
    }
  }
}
walk(root)
