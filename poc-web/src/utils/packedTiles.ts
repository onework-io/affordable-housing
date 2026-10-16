// 打包圖磚（scripts/fetch-tiles.mjs 產生的 public/tiles/<圖層>/z<縮放>.json）
// 以 MapLibre 自訂協定 packed://<圖層>/{z}/{x}/{y} 讀取，用在不能連外部圖磚的展示環境。
import maplibregl from 'maplibre-gl'

const EMPTY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==' // 1×1 透明
const VECTOR_LAYERS = new Set(['osm', 'tybuild', 'tycomm'])
const bundles = new Map<string, Promise<Record<string, string> | null>>()

function decode(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function bundle(layer: string, z: string) {
  const key = `${layer}/${z}`
  if (!bundles.has(key))
    bundles.set(
      key,
      fetch(`${import.meta.env.BASE_URL}tiles/${layer}/z${z}.json`)
        .then((r) => (r.ok ? r.json().then((j: { tiles: Record<string, string> }) => j.tiles) : null))
        .catch(() => null),
    )
  return bundles.get(key)!
}

let registered = false
export function registerPackedTiles() {
  if (registered) return
  registered = true
  maplibregl.addProtocol('packed', async (params) => {
    const m = params.url.match(/^packed:\/\/(\w+)\/(\d+)\/(\d+)\/(\d+)/)
    if (!m) throw new Error(`bad packed url ${params.url}`)
    const [, layer, z, x, y] = m
    const tiles = await bundle(layer, z)
    const b64 = tiles?.[`${x}/${y}`]
    if (b64) return { data: decode(b64) }
    // 範圍外或缺圖：向量圖層回傳空圖磚，影像圖層回傳透明圖，不在 console 報錯
    return { data: VECTOR_LAYERS.has(layer) ? new ArrayBuffer(0) : decode(EMPTY_PNG) }
  })
}
