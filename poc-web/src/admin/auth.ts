// 後台登入（PoC）：示範帳號在前端比對，登入狀態存在分頁的 sessionStorage（關閉分頁即登出）。
// 正式版改由後端驗證（帳號密碼雜湊、Session／JWT、錯誤次數鎖定），前端不存放密碼。
import { create } from 'zustand'

const DEMO_ACCOUNTS: Record<string, { password: string; name: string }> = {
  admin: { password: 'admin123', name: '系統管理員' },
}
const KEY = 'ah3d-admin-session'
let memSession: string | null = null
const read = () => {
  try { return sessionStorage.getItem(KEY) } catch { return memSession }
}
const write = (v: string | null) => {
  try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY) } catch { memSession = v }
}

interface AuthState {
  user: { account: string; name: string } | null
  login: (account: string, password: string) => boolean
  logout: () => void
}

const restored = (() => {
  const v = read()
  if (!v) return null
  try { return JSON.parse(v) as AuthState['user'] } catch { return null }
})()

export const useAuth = create<AuthState>((set) => ({
  user: restored,
  login: (account, password) => {
    const a = DEMO_ACCOUNTS[account.trim().toLowerCase()]
    if (!a || a.password !== password) return false
    const user = { account: account.trim().toLowerCase(), name: a.name }
    write(JSON.stringify(user))
    set({ user })
    return true
  },
  logout: () => {
    write(null)
    set({ user: null })
  },
}))
