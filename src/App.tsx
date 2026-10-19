import { useEffect, useMemo, useState } from 'react'
import { GenderViewToggle } from './components/GenderViewToggle'
import { Legend } from './components/Legend'
import { SeatDetailModal } from './components/SeatDetailModal'
import { SeatMap } from './components/SeatMap'
import { StaffLoginModal } from './components/StaffLoginModal'
import { useAuth } from './hooks/useAuth'
import { useEvents, useSeatMap } from './hooks/useEventData'
import { eventHasGenderSwap, ZONE_LABELS } from './lib/allocation'
import { isSeatSellable } from './lib/seatStatus'
import { isSupabaseConfigured } from './lib/supabase'
import type { GenderView, SeatWithState, SeatZone } from './types'

function App() {
  const { events, loading: eventsLoading } = useEvents()
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const activeEvent = useMemo(() => {
    if (!events.length) return null
    const slug = activeSlug ?? events[0].slug
    return events.find((e) => e.slug === slug) ?? events[0]
  }, [events, activeSlug])

  const { isStaff, signIn, signOut, isDemo, email } = useAuth()
  const [genderView, setGenderView] = useState<GenderView>('men')
  const swapActive = activeEvent
    ? eventHasGenderSwap(activeEvent.slug)
    : false

  useEffect(() => {
    setGenderView('men')
  }, [activeEvent?.slug])

  const {
    seatsWithState,
    loading: seatsLoading,
    upsertSeatState,
    updateSeatGeometry,
    insertSeat,
  } = useSeatMap(activeEvent?.id ?? null, activeEvent?.slug ?? null, genderView)

  const [highlightAvailable, setHighlightAvailable] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [selectedSeat, setSelectedSeat] = useState<SeatWithState | null>(null)
  const [placementMode, setPlacementMode] = useState(false)
  const [moveLayoutMode, setMoveLayoutMode] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [pendingRect, setPendingRect] = useState<{
    x: number
    y: number
    w: number
    h: number
  } | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newSection, setNewSection] = useState('')
  const [newZone, setNewZone] = useState<SeatZone>('courtside')

  const stats = useMemo(() => {
    let available = 0
    let sold = 0
    for (const s of seatsWithState) {
      if (!isSeatSellable(s)) continue
      if (s.state.status === 'available') available++
      else if (
        s.state.status === 'presold' ||
        s.state.status === 'daysold'
      )
        sold++
    }
    const total = seatsWithState.filter((s) => isSeatSellable(s)).length
    return { available, sold, total }
  }, [seatsWithState])

  const onDragStart = (x: number, y: number) => {
    setDragStart({ x, y })
    setPendingRect({ x, y, w: 0, h: 0 })
  }

  const onDragMove = (x: number, y: number) => {
    if (!dragStart) return
    const x0 = Math.min(dragStart.x, x)
    const y0 = Math.min(dragStart.y, y)
    const w = Math.abs(x - dragStart.x)
    const h = Math.abs(y - dragStart.y)
    setPendingRect({ x: x0, y: y0, w, h })
  }

  const onDragEnd = async () => {
    if (!pendingRect || !activeEvent) {
      setDragStart(null)
      setPendingRect(null)
      return
    }
    if (pendingRect.w < 0.01 || pendingRect.h < 0.01) {
      setDragStart(null)
      setPendingRect(null)
      return
    }
    const label =
      newLabel.trim() ||
      window.prompt('新しい席のラベル（例: C-1）', `C-${seatsWithState.length + 1}`)
    if (!label) {
      setDragStart(null)
      setPendingRect(null)
      return
    }
    const section =
      newSection.trim() ||
      window.prompt('ブロック名（任意）', 'C') ||
      null

    await insertSeat({
      event_id: activeEvent.id,
      label,
      section: section || null,
      zone: newZone,
      x: pendingRect.x,
      y: pendingRect.y,
      w: pendingRect.w,
      h: pendingRect.h,
    })
    setDragStart(null)
    setPendingRect(null)
    setNewLabel('')
  }

  const handleSaveSeat = async (
    seatId: string,
    allocation: SeatWithState['effectiveAllocation'],
    status: Parameters<typeof upsertSeatState>[2],
    note: string | null,
  ) => {
    const { error } = await upsertSeatState(seatId, allocation, status, note)
    if (error) alert('保存に失敗しました: ' + error.message)
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-3 py-3 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-slate-800 sm:text-xl">
              会場席状況（リアルタイム）
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {!isSupabaseConfigured && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">
                  デモモード
                </span>
              )}
              {isStaff ? (
                <>
                  <span className="text-emerald-700">
                    編集中{email ? ` (${email})` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                  >
                    ログアウト
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setLoginOpen(true)}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 font-medium text-white hover:bg-slate-900"
                >
                  スタッフログイン
                </button>
              )}
            </div>
          </div>

          {swapActive && (
            <div className="flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
              <div className="flex flex-wrap items-center gap-3">
                <GenderViewToggle value={genderView} onChange={setGenderView} />
                <span>
                  最終2日: コートサイド・エンド・スペシャル席は{' '}
                  <strong>男子/女子で在庫が別</strong>です。{' '}
                  <strong>1階席は終日共通</strong>（切替の影響なし）。
                </span>
              </div>
              <p className="text-xs text-violet-700">
                水色枠＝1階（終日） / 紫枠＝男女切替対象エリア
              </p>
            </div>
          )}

          <p className="text-sm text-slate-600">
            駒オリ: <strong>2階席</strong>と<strong>チーム席</strong>は販売しません（地図はPDFの色のまま、空席に色は付けません）。
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {events.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => setActiveSlug(ev.slug)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  activeEvent?.id === ev.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                {ev.title}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Legend />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={highlightAvailable}
                onChange={(e) => setHighlightAvailable(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              空席のみ表示（案内用・販売済は非表示）
            </label>
            {isStaff && (
              <>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={moveLayoutMode}
                    onChange={(e) => {
                      setMoveLayoutMode(e.target.checked)
                      if (e.target.checked) setPlacementMode(false)
                    }}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  席位置調整（PDF図形をドラッグ）
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={placementMode}
                    onChange={(e) => {
                      setPlacementMode(e.target.checked)
                      if (e.target.checked) setMoveLayoutMode(false)
                    }}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  席を手動追加
                </label>
              </>
            )}
            <span className="ml-auto text-sm text-slate-600">
              空席 {stats.available} / 販売済 {stats.sold} / 全 {stats.total} 席
            </span>
          </div>

          {placementMode && isStaff && (
            <div className="flex flex-wrap gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
              <input
                placeholder="次に追加する席ラベル（任意）"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1"
              />
              <input
                placeholder="ブロック（任意）"
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                className="w-24 rounded border border-slate-300 px-2 py-1"
              />
              <select
                value={newZone}
                onChange={(e) => setNewZone(e.target.value as SeatZone)}
                className="rounded border border-slate-300 px-2 py-1"
                title="席種別"
              >
                {(Object.keys(ZONE_LABELS) as SeatZone[]).map((z) => (
                  <option key={z} value={z}>
                    {ZONE_LABELS[z]}
                  </option>
                ))}
              </select>
              <span className="text-blue-800">
                会場図上をドラッグして矩形を描き、席を追加します
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col p-3">
        {eventsLoading || seatsLoading ? (
          <p className="py-12 text-center text-slate-500">読み込み中…</p>
        ) : activeEvent ? (
          <SeatMap
            event={activeEvent}
            seats={seatsWithState}
            highlightAvailableOnly={highlightAvailable}
            isStaff={isStaff}
            placementMode={placementMode}
            moveLayoutMode={moveLayoutMode}
            onSeatClick={setSelectedSeat}
            onSeatMove={(seatId, geom) => {
              void updateSeatGeometry(seatId, geom)
            }}
            dragStart={dragStart}
            pendingRect={pendingRect}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
          />
        ) : (
          <p className="py-12 text-center text-slate-500">
            試合データがありません。Supabase の events テーブルを確認してください。
          </p>
        )}
      </main>

      <StaffLoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSignIn={signIn}
        isDemo={isDemo}
      />

      <SeatDetailModal
        seat={selectedSeat}
        eventSlug={activeEvent?.slug ?? ''}
        genderView={genderView}
        onClose={() => setSelectedSeat(null)}
        isStaff={isStaff}
        placementMode={placementMode || moveLayoutMode}
        onSave={handleSaveSeat}
      />
    </div>
  )
}

export default App
