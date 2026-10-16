// 後台設定（PoC）：存在瀏覽器 localStorage，前台讀取時套用。
// 正式版這些資料由後端資料庫維護，前後台透過 API 取得。
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { useAuth } from './auth'
import type { Community, Facility, FacilityCategory, ModelPlacement, Unit, UnitStatus } from '@/types'

export interface CommunityOverride {
  name?: string
  district?: string
  address?: string
  lngLat?: [number, number]
  enabled?: boolean // 是否在前台圖台顯示
  model?: Partial<ModelPlacement>
}
export type UnitOverride = Partial<Pick<Unit, 'status' | 'price' | 'panoUrl'>>
export interface LifeCircleParams { walk: number; drive: number; defaultMinutes: number; min: number; max: number; step: number }
export interface SyncLog { id: string; time: string; job: string; result: 'success' | 'warning' | 'failed'; records: number; message: string; by: string }
export interface AuditEntry { id: string; time: string; user: string; action: string; target: string; detail?: string }
export type Role = 'admin' | 'editor' | 'viewer'
export interface AdminUser { id: string; name: string; account: string; org: string; role: Role; active: boolean; lastLogin: string }

export const DEFAULT_LIFE_CIRCLE: LifeCircleParams = { walk: 4.8, drive: 30, defaultMinutes: 15, min: 5, max: 30, step: 5 }
export const ROLE_LABEL: Record<Role, string> = { admin: '系統管理員', editor: '業務管理員', viewer: '檢視人員' }
export const CURRENT_USER = '業務管理員（示範）'

const now = () => new Date().toISOString()
const uid = () => Math.random().toString(36).slice(2, 10)

// localStorage 可能不可用（私密視窗、預覽環境）：失敗時退回記憶體
const mem = new Map<string, string>()
const safeStorage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k) } catch { return mem.get(k) ?? null } },
  setItem: (k, v) => { try { localStorage.setItem(k, v) } catch { mem.set(k, v) } },
  removeItem: (k) => { try { localStorage.removeItem(k) } catch { mem.delete(k) } },
}

const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString()
const SEED_SYNC: SyncLog[] = [
  { id: 's3', time: ago(35), job: '出售狀態與戶數', result: 'success', records: 37, message: '示範資料更新 37 戶銷售狀態', by: '排程' },
  { id: 's2', time: ago(95), job: '環景連結有效性', result: 'warning', records: 495, message: '149 戶尚未提供環景連結', by: '排程' },
  { id: 's1', time: ago(1440), job: '住宅與戶別資料', result: 'failed', records: 0, message: '既有交易平台 API 尚未介接（待取得規格）', by: '排程' },
]
const SEED_AUDIT: AuditEntry[] = [
  { id: 'a2', time: ago(60), user: '系統管理員', action: '新增帳號', target: '業務管理員（示範）' },
  { id: 'a1', time: ago(1500), user: '系統管理員', action: '匯入模型清冊', target: '示範社區 A11', detail: 'PoC 社區（9 個 GLB）' },
]
const SEED_USERS: AdminUser[] = [
  { id: 'u1', name: '系統管理員', account: 'admin', org: '資訊科', role: 'admin', active: true, lastLogin: ago(60) },
  { id: 'u2', name: '業務管理員（示範）', account: 'housing01', org: '住宅發展處', role: 'editor', active: true, lastLogin: ago(5) },
  { id: 'u3', name: '檢視人員', account: 'viewer01', org: '地政局', role: 'viewer', active: false, lastLogin: ago(4320) },
]

interface AdminState {
  communityOverrides: Record<string, CommunityOverride>
  addedCommunities: Community[]
  unitOverrides: Record<string, UnitOverride>
  lifeCircle: LifeCircleParams
  categoryEnabled: Record<FacilityCategory, boolean>
  importedFacilities: Facility[]
  syncLogs: SyncLog[]
  audit: AuditEntry[]
  users: AdminUser[]

  log: (action: string, target: string, detail?: string) => void
  saveCommunity: (id: string, o: CommunityOverride, label: string) => void
  addCommunity: (c: Community) => void
  setUnit: (unitId: string, o: UnitOverride, label: string) => void
  setLifeCircle: (p: LifeCircleParams) => void
  setCategoryEnabled: (c: FacilityCategory, on: boolean, label: string) => void
  importFacilities: (fs: Facility[], fileName: string) => void
  clearImportedFacilities: () => void
  addSyncLog: (l: Omit<SyncLog, 'id' | 'time'>) => void
  setUser: (id: string, patch: Partial<AdminUser>) => void
  resetAll: () => void
}

const initial = () => ({
  communityOverrides: {},
  addedCommunities: [],
  unitOverrides: {},
  lifeCircle: DEFAULT_LIFE_CIRCLE,
  categoryEnabled: { medical: true, shopping: true, school: true, park: true, transit: true, public: true } as Record<FacilityCategory, boolean>,
  importedFacilities: [],
  syncLogs: SEED_SYNC,
  audit: SEED_AUDIT,
  users: SEED_USERS,
})

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      ...initial(),
      log: (action, target, detail) =>
        set({ audit: [{ id: uid(), time: now(), user: useAuth.getState().user?.name ?? CURRENT_USER, action, target, detail }, ...get().audit].slice(0, 300) }),
      saveCommunity: (id, o, label) => {
        set({ communityOverrides: { ...get().communityOverrides, [id]: { ...get().communityOverrides[id], ...o } } })
        get().log('更新住宅與建物', label)
      },
      addCommunity: (c) => {
        set({ addedCommunities: [...get().addedCommunities, c] })
        get().log('新增社區', c.name, `${c.district}・地上 ${c.floorsAbove} 層`)
      },
      setUnit: (unitId, o, label) => {
        set({ unitOverrides: { ...get().unitOverrides, [unitId]: { ...get().unitOverrides[unitId], ...o } } })
        get().log('更新戶別資料', label, Object.entries(o).map(([k, v]) => `${k}=${v ?? '（清除）'}`).join('，'))
      },
      setLifeCircle: (p) => {
        set({ lifeCircle: p })
        get().log('更新生活圈參數', '生活圈', `步行 ${p.walk} km/h、開車 ${p.drive} km/h、預設 ${p.defaultMinutes} 分`)
      },
      setCategoryEnabled: (c, on, label) => {
        set({ categoryEnabled: { ...get().categoryEnabled, [c]: on } })
        get().log(on ? '啟用設施圖層' : '停用設施圖層', label)
      },
      importFacilities: (fs, fileName) => {
        set({ importedFacilities: [...get().importedFacilities, ...fs] })
        get().log('匯入生活設施', fileName, `${fs.length} 筆`)
      },
      clearImportedFacilities: () => {
        set({ importedFacilities: [] })
        get().log('清除匯入設施', '生活設施圖層')
      },
      addSyncLog: (l) => set({ syncLogs: [{ ...l, id: uid(), time: now() }, ...get().syncLogs].slice(0, 100) }),
      setUser: (id, patch) => {
        set({ users: get().users.map((u) => (u.id === id ? { ...u, ...patch } : u)) })
        const u = get().users.find((x) => x.id === id)
        get().log('更新帳號權限', u?.name ?? id, Object.entries(patch).map(([k, v]) => `${k}=${v}`).join('，'))
      },
      resetAll: () => set({ ...initial(), audit: [{ id: uid(), time: now(), user: CURRENT_USER, action: '還原示範設定', target: '全部' }] }),
    }),
    { name: 'ah3d-admin-v1', storage: createJSONStorage(() => safeStorage), version: 1 },
  ),
)

export type { UnitStatus }
