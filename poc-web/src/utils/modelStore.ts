// 上傳 GLB 的本機儲存（IndexedDB）。正式版改為上傳至後端物件儲存，前台以 URL 載入。
const DB = 'ah3d-models'
const STORE = 'glb'
const urlCache = new Map<string, string>()

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export async function putModel(key: string, blob: Blob) {
  await tx('readwrite', (s) => s.put(blob, key))
  const old = urlCache.get(key)
  if (old) URL.revokeObjectURL(old)
  urlCache.delete(key)
}

export async function getModelUrl(key: string): Promise<string | null> {
  if (urlCache.has(key)) return urlCache.get(key)!
  const blob = await tx<Blob | undefined>('readonly', (s) => s.get(key) as IDBRequest<Blob | undefined>)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urlCache.set(key, url)
  return url
}

export async function deleteModel(key: string) {
  await tx('readwrite', (s) => s.delete(key))
  const old = urlCache.get(key)
  if (old) URL.revokeObjectURL(old)
  urlCache.delete(key)
}

export interface GlbCheck { ok: boolean; error?: string; generator?: string; meshes?: number }

/** 檢查 GLB 檔頭與必要擴充（Draco / meshopt 壓縮需先解壓） */
export async function checkGlb(file: Blob): Promise<GlbCheck> {
  const head = new DataView(await file.slice(0, 20).arrayBuffer())
  if (head.byteLength < 20 || head.getUint32(0, true) !== 0x46546c67) return { ok: false, error: '不是有效的 GLB 檔（檔頭不是 glTF）' }
  if (head.getUint32(4, true) !== 2) return { ok: false, error: '僅支援 glTF 2.0' }
  const jsonLen = head.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(await file.slice(20, 20 + jsonLen).arrayBuffer()))
  const req: string[] = json.extensionsRequired ?? []
  const bad = req.filter((e) => /draco|meshopt/i.test(e))
  if (bad.length) return { ok: false, error: `模型使用 ${bad.join('、')} 壓縮，請先以 gltf-transform 解壓縮後再上傳` }
  return { ok: true, generator: json.asset?.generator, meshes: json.meshes?.length ?? 0 }
}
