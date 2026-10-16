// 二進位資產（GLB、EXR）的網址解析。
// 一般部署直接用原檔；發佈到不支援二進位檔型別的環境時（VITE_PACKED_ASSETS=1），
// 由 scripts/pack-assets.mjs 預先轉成 <檔名>.json（base64），這裡讀回並轉成 blob URL。
const PACKED = import.meta.env.VITE_PACKED_ASSETS === '1'
const cache = new Map<string, Promise<string>>()

export function resolveAsset(url: string): Promise<string> {
  if (!PACKED) return Promise.resolve(url)
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(`${url}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`資產載入失敗 HTTP ${r.status}：${url}`)
          return r.json() as Promise<{ mime: string; base64: string }>
        })
        .then(({ mime, base64 }) => {
          const bin = atob(base64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          return URL.createObjectURL(new Blob([bytes], { type: mime }))
        }),
    )
  }
  return cache.get(url)!
}
