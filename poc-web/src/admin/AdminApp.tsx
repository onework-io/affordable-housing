// 後台管理介面（對應提案「桃園市可負擔住宅圖台管理系統」）
import { navigate } from '@/router'
import { useAdminStore } from './adminStore'
import { useAuth } from './auth'
import { Icon, Toaster } from './ui'
import { Dashboard } from './pages/Dashboard'
import { Communities } from './pages/Communities'
import { Units } from './pages/Units'
import { Panoramas } from './pages/Panoramas'
import { Facilities } from './pages/Facilities'
import { LifeCircleParamsPage } from './pages/LifeCircleParams'
import { SyncLogs } from './pages/SyncLogs'
import { Accounts } from './pages/Accounts'
import { AuditLog } from './pages/AuditLog'

const MENU = [
  { id: '', label: '管理首頁', icon: 'home', page: Dashboard },
  { id: 'communities', label: '住宅與建物管理', icon: 'building', page: Communities },
  { id: 'units', label: '戶別資料管理', icon: 'list', page: Units },
  { id: 'panoramas', label: '環景連結管理', icon: 'link', page: Panoramas },
  { id: 'facilities', label: '生活設施圖層', icon: 'pin', page: Facilities },
  { id: 'life-circle', label: '生活圈參數', icon: 'circle', page: LifeCircleParamsPage },
  { id: 'sync', label: '資料同步紀錄', icon: 'sync', page: SyncLogs },
  { id: 'accounts', label: '帳號與權限', icon: 'users', page: Accounts },
  { id: 'audit', label: '操作紀錄', icon: 'doc', page: AuditLog },
]

export function AdminApp({ path }: { path: string }) {
  const user = useAuth((s) => s.user)!
  const logout = useAuth((s) => s.logout)
  return <AdminShell path={path} userName={user.name} onLogout={() => { useAdminStore.getState().log('登出系統', user.account); logout() }} />
}

function AdminShell({ path, userName, onLogout }: { path: string; userName: string; onLogout: () => void }) {
  const sub = path.replace(/^\/admin\/?/, '').split('/')[0]
  const item = MENU.find((m) => m.id === sub) ?? MENU[0]
  const Page = item.page
  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-lg text-white">⌂</span>
          <span className="text-lg font-bold">可負擔住宅圖台管理系統</span>
          <span className="chip bg-slate-100 text-ink-muted">PoC · 設定存在本機瀏覽器</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <a href="#/" className="btn-ghost py-1.5">回前台圖台 ↗</a>
          <span className="flex items-center gap-2 text-ink-muted">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{userName.slice(0, 1)}</span>
            {userName}
          </span>
          <button className="btn-ghost py-1.5" data-testid="logout" onClick={onLogout}>
            登出
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="w-56 shrink-0 space-y-0.5 overflow-y-auto border-r border-slate-200 bg-white p-3" aria-label="後台選單">
          {MENU.map((m) => {
            const active = m.id === item.id
            return (
              <button
                key={m.id}
                data-testid={`menu-${m.id || 'home'}`}
                onClick={() => navigate(`/admin/${m.id}`)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${active ? 'bg-brand-soft font-semibold text-brand' : 'text-ink hover:bg-slate-50'}`}
              >
                <Icon name={m.icon} />
                {m.label}
              </button>
            )
          })}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <Page />
        </main>
      </div>
      <Toaster />
    </div>
  )
}
