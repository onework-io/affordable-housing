// 登入頁：前台圖台與後台管理都需先登入
import { useState, type FormEvent } from 'react'
import { useAuth } from './auth'
import { useAdminStore } from './adminStore'

export function Login() {
  const login = useAuth((s) => s.login)
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!account.trim() || !password) return setError('請輸入帳號與密碼')
    setBusy(true)
    setError('')
    setTimeout(() => {
      const ok = login(account, password)
      setBusy(false)
      if (ok) useAdminStore.getState().log('登入系統', account.trim())
      else setError('帳號或密碼錯誤，請再試一次')
    }, 350)
  }

  return (
    <div className="flex h-full min-h-0 bg-slate-50" data-testid="login-page">
      {/* 左側品牌區 */}
      <aside className="relative hidden w-[46%] max-w-[640px] flex-col justify-between overflow-hidden bg-[#0f2a22] p-10 text-white lg:flex">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]" aria-hidden="true">
          <defs>
            <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M44 0H0V44" fill="none" stroke="#6ee7b7" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          <circle cx="62%" cy="58%" r="150" fill="none" stroke="#34d399" strokeWidth="1.5" strokeDasharray="6 6" />
          <circle cx="62%" cy="58%" r="6" fill="#34d399" />
        </svg>
        {/* 量體剪影 */}
        <svg className="pointer-events-none absolute bottom-0 right-0 h-[58%] w-full" viewBox="0 0 600 360" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
          <g fill="#134e3a">
            <rect x="40" y="220" width="70" height="140" />
            <rect x="120" y="180" width="54" height="180" />
            <rect x="190" y="250" width="90" height="110" />
            <rect x="460" y="200" width="80" height="160" />
          </g>
          <g fill="#059669">
            <rect x="300" y="60" width="62" height="300" rx="2" />
            <rect x="372" y="110" width="56" height="250" rx="2" />
          </g>
          <g fill="#10b981">
            <rect x="300" y="168" width="62" height="10" />
          </g>
        </svg>
        <div className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-xl">⌂</span>
          <span className="text-sm font-semibold tracking-wide text-emerald-100">桃園市政府・可負擔住宅</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-[34px] font-bold leading-tight">桃園市可負擔住宅<br />三維圖台</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-emerald-100/85">2D／3D 圖台、自訂生活圈、房源與 720 環景看屋，以及住宅與圖層的後台管理。</p>
        </div>
        <p className="relative text-xs text-emerald-100/60">PoC 示範環境・資料為示意</p>
      </aside>

      {/* 右側表單 */}
      <main className="flex min-w-0 flex-1 items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-[380px]" noValidate>
          <div className="mb-8 lg:hidden">
            <div className="text-xs font-semibold text-brand">桃園市可負擔住宅三維圖台</div>
            <div className="text-2xl font-bold">三維圖台</div>
          </div>
          <h2 className="text-2xl font-bold text-ink">登入</h2>
          <p className="mt-1 text-sm text-ink-muted">請以帳號登入後使用圖台與後台管理。</p>

          <label className="mt-7 block">
            <span className="text-sm font-medium text-ink">帳號</span>
            <input
              data-testid="login-account"
              autoFocus
              autoComplete="username"
              value={account}
              onChange={(e) => { setAccount(e.target.value); setError('') }}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="輸入帳號"
            />
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-ink">密碼</span>
            <div className="relative mt-1.5">
              <input
                data-testid="login-password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-16 text-[15px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                placeholder="輸入密碼"
              />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-ink-muted hover:bg-slate-100" aria-label={show ? '隱藏密碼' : '顯示密碼'}>
                {show ? '隱藏' : '顯示'}
              </button>
            </div>
          </label>

          {error && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert" data-testid="login-error">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} data-testid="login-submit" className="btn-primary mt-6 w-full py-2.5 text-[15px]">
            {busy ? '登入中…' : '登入'}
          </button>

          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2.5 text-xs text-ink-muted">
            示範帳號：<b className="text-ink">admin</b>　密碼：<b className="text-ink">admin123</b>
          </div>
        </form>
      </main>
    </div>
  )
}
