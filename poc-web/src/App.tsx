import { Suspense, lazy, useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { LeftPanel } from '@/components/LeftPanel'
import { RightPanel } from '@/components/RightPanel'
import { MapView } from '@/components/MapView'
import { PanoramaModal } from '@/components/PanoramaModal'
import { CompareBar, CompareModal } from '@/components/Compare'

// three.js 單棟檢視：用到才載入
const BuildingViewer = lazy(() => import('@/components/BuildingViewer'))
import { AdminApp } from '@/admin/AdminApp'
import { useRoute } from '@/router'
import { useAuth } from '@/admin/auth'
import { Login } from '@/admin/Login'
import { useAdminStore } from '@/admin/adminStore'

export function App() {
  const path = useRoute()
  const user = useAuth((s) => s.user)
  // 整個圖台（前台與後台）都需先登入；登入後回到原本要去的頁面
  if (!user) return <Login />
  return path.startsWith('/admin') ? <AdminApp path={path} /> : <FrontApp />
}

function FrontApp() {
  const ready = useAppStore((s) => s.ready)
  const buildingViewId = useAppStore((s) => s.buildingViewId)
  // 每次進入前台都重新載入，套用後台最新設定；#/?focus=<社區代碼> 會直接選取該社區
  useEffect(() => {
    const focus = new URLSearchParams(location.hash.split('?')[1] ?? '').get('focus')
    useAppStore.setState({ ready: false })
    useAppStore
      .getState()
      .init()
      .then(() => {
        if (focus) useAppStore.getState().selectCommunity(focus)
      })
  }, [])

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-lg text-white">⌂</span>
          <h1 className="text-lg font-bold">可負擔住宅三維圖台</h1>
          <span className="chip bg-slate-100 text-ink-muted">PoC · 示範資料</span>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          {['線上賞屋', '三維圖台', '常見問題'].map((t) => (
            <span key={t} className={`rounded-md px-3 py-1.5 ${t === '三維圖台' ? 'bg-brand-soft font-semibold text-brand' : 'text-ink-muted'}`}>
              {t}
            </span>
          ))}
          <a href="#/admin" data-testid="to-admin" className="ml-2 rounded-md border border-slate-200 px-3 py-1.5 text-ink hover:bg-brand-soft">
            後台管理
          </a>
          <UserMenu />
        </nav>
      </header>
      <main className="flex min-h-0 flex-1">
        <LeftPanel />
        <div className="relative min-w-0 flex-1 py-3">
          <div className="h-full overflow-hidden rounded-xl shadow-card">{ready ? <MapView /> : <div className="grid h-full place-items-center text-ink-muted">載入中…</div>}</div>
          {!buildingViewId && <CompareBar />}
          {buildingViewId && (
            <div className="absolute inset-0 py-3">
              <div className="relative h-full">
                <Suspense fallback={<div className="grid h-full place-items-center rounded-xl bg-white text-ink-muted">載入單棟檢視…</div>}>
                  <BuildingViewer key={buildingViewId} />
                </Suspense>
              </div>
            </div>
          )}
        </div>
        <RightPanel />
      </main>
      <PanoramaModal />
      <CompareModal />
    </div>
  )
}

function UserMenu() {
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  if (!user) return null
  return (
    <span className="ml-2 flex items-center gap-2 border-l border-slate-200 pl-3 text-ink-muted">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{user.name.slice(0, 1)}</span>
      {user.name}
      <button
        className="rounded-md px-2 py-1 text-xs hover:bg-slate-100"
        data-testid="front-logout"
        onClick={() => {
          useAdminStore.getState().log('登出系統', user.account)
          logout()
        }}
      >
        登出
      </button>
    </span>
  )
}
