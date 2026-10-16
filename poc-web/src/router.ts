// 極簡 hash 路由：#/ 為前台圖台，#/admin/<頁面> 為後台
import { useEffect, useState } from 'react'

const read = () => (location.hash.replace(/^#/, '') || '/').split('?')[0]

export function useRoute() {
  const [path, setPath] = useState(read)
  useEffect(() => {
    const on = () => setPath(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return path
}

export const navigate = (path: string) => {
  location.hash = path
}
