// 線上賞屋（720 環景）示範連結
// 正式版：每一戶對應既有 720 環景平台的連結，由後台「環景連結管理」維護。
// PoC：所有有環景的戶別都先指向同一個外部 720 環景（AIHouse），非本戶實景。
export const DEMO_VR = {
  url: 'https://www.aihouse.com/720/S114961257?lang=zh-TW',
  provider: 'AIHouse 720 環景（特力屋 鄉村臥房）',
}

/** 是否嘗試以 iframe 嵌入（發佈環境不允許嵌入外部網站時以 VITE_EMBED_VR=off 關閉，改為另開分頁） */
export const EMBED_VR = import.meta.env.VITE_EMBED_VR !== 'off'
