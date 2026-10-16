// 生活圈參數：速度、預設時間與時間範圍（前台畫圈半徑 = 速度 × 時間）
import { useState } from 'react'
import { DEFAULT_LIFE_CIRCLE, useAdminStore, type LifeCircleParams } from '../adminStore'
import { Card, Field, PageHeader, Table, inputCls, toast } from '../ui'

const fmt = (km: number) => (km < 1 ? `${Math.round(km * 1000)} 公尺` : `${km.toFixed(2)} 公里`)

export function LifeCircleParamsPage() {
  const cur = useAdminStore((s) => s.lifeCircle)
  const setLc = useAdminStore((s) => s.setLifeCircle)
  const [p, setP] = useState<LifeCircleParams>(cur)
  const set = (k: keyof LifeCircleParams) => (e: { target: { value: string } }) => setP({ ...p, [k]: +e.target.value })
  const errors = [
    !(p.walk >= 1 && p.walk <= 8) && '步行速度須介於 1–8 km/h',
    !(p.drive >= 5 && p.drive <= 80) && '開車速度須介於 5–80 km/h',
    !(p.min >= 1 && p.max <= 120 && p.min < p.max) && '時間範圍不正確',
    !(p.step >= 1 && (p.max - p.min) % p.step === 0) && '間距須能整除時間範圍',
    !(p.defaultMinutes >= p.min && p.defaultMinutes <= p.max) && '預設時間須在範圍內',
  ].filter(Boolean) as string[]
  const minutes: number[] = []
  if (!errors.length) for (let m = p.min; m <= p.max; m += p.step) minutes.push(m)
  const changed = JSON.stringify(p) !== JSON.stringify(cur)

  return (
    <div className="space-y-4">
      <PageHeader title="生活圈參數" desc="本期採距離圈選：半徑 = 設定速度 × 時間，不代表實際步行或通勤可達時間。儲存後前台生活圈立即套用。" />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card title="參數設定">
          <div className="grid grid-cols-2 gap-3">
            <Field label="步行速度（km/h）"><input type="number" step="0.1" className={inputCls} value={p.walk} onChange={set('walk')} data-testid="walk-speed" /></Field>
            <Field label="開車速度（km/h）"><input type="number" step="1" className={inputCls} value={p.drive} onChange={set('drive')} /></Field>
            <Field label="預設時間（分）"><input type="number" className={inputCls} value={p.defaultMinutes} onChange={set('defaultMinutes')} /></Field>
            <Field label="間距（分）"><input type="number" className={inputCls} value={p.step} onChange={set('step')} /></Field>
            <Field label="最短（分）"><input type="number" className={inputCls} value={p.min} onChange={set('min')} /></Field>
            <Field label="最長（分）"><input type="number" className={inputCls} value={p.max} onChange={set('max')} /></Field>
          </div>
          {errors.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-rose-600">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="mt-4 flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setP(DEFAULT_LIFE_CIRCLE)}>恢復預設值</button>
            <button className="btn-primary flex-1" disabled={!changed || errors.length > 0} data-testid="save-lc" onClick={() => { setLc(p); toast('已儲存生活圈參數') }}>儲存</button>
          </div>
        </Card>
        <Card title="半徑預覽">
          <Table head={['時間', '步行半徑', '開車半徑']}>
            {minutes.map((m) => (
              <tr key={m} className={m === p.defaultMinutes ? 'bg-brand-soft/60 font-semibold' : ''}>
                <td className="px-2 py-1.5 tabular-nums">{m} 分{m === p.defaultMinutes && '（預設）'}</td>
                <td className="px-2 py-1.5 tabular-nums">{fmt((p.walk * m) / 60)}</td>
                <td className="px-2 py-1.5 tabular-nums">{fmt((p.drive * m) / 60)}</td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-xs text-ink-faint">開車半徑偏大時，圈內幾乎涵蓋整個行政區，篩選效果有限；建議依需求訪談結果調整速度或時間上限。</p>
        </Card>
      </div>
    </div>
  )
}
