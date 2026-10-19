import { useEffect, useMemo, useState } from 'react'
import { GenderViewToggle } from './components/GenderViewToggle'
import { SharePublicLink } from './components/SharePublicLink'
import { StaffDaySalesModal } from './components/StaffDaySalesModal'
import { OtaStaffSeatChoiceModal } from './components/OtaStaffSeatChoiceModal'
import { OtaSeatViewModal } from './components/OtaSeatViewModal'
import { SeatDetailModal } from './components/SeatDetailModal'
import { SeatMap } from './components/SeatMap'
import { StaffLoginModal } from './components/StaffLoginModal'
import { useAuth } from './hooks/useAuth'
import { useEvents, useSeatMap } from './hooks/useEventData'
import { eventHasGenderSwap } from './lib/allocation'
import { otaBlockForSeat } from './lib/otaBlockMap'
import {
  eventHasOtaSeatView,
  OTA_SEAT_VIEW_PATH,
} from './lib/otaSeatView'
import { appendDaySale, countDaySales } from './lib/daySaleLog'
import { isSeatSellable } from './lib/seatStatus'
import { isSupabaseConfigured } from './lib/supabase'
import type { GenderView, SeatWithState } from './types'

function App() {
  const { events, loading: eventsLoading } = useEvents()
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const activeEvent = useMemo(() => {
    if (!events.length) return null
    const slug = activeSlug ?? events[0].slug
    return events.find((e) => e.slug === slug) ?? events[0]
  }, [events, activeSlug])

  const { isStaff, signIn, signOut, isDemo, email, loading: authLoading } =
    useAuth()
  const [genderView, setGenderView] = useState<GenderView>('men')
  const swapActive = activeEvent
    ? eventHasGenderSwap(activeEvent.slug)
    : false

  useEffect(() => {
    setGenderView('men')
  }, [activeEvent?.slug])

  useEffect(() => {
    const onLog = () => setDaySalesTick((t) => t + 1)
    window.addEventListener('seat-map-day-sales-changed', onLog)
    return () => window.removeEventListener('seat-map-day-sales-changed', onLog)
  }, [])

  const { seatsWithState, loading: seatsLoading, upsertSeatState } =
    useSeatMap(activeEvent?.id ?? null, activeEvent?.slug ?? null, genderView)

  const [highlightAvailable, setHighlightAvailable] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [selectedSeat, setSelectedSeat] = useState<SeatWithState | null>(null)
  const [otaStaffChoiceSeat, setOtaStaffChoiceSeat] =
    useState<SeatWithState | null>(null)
  const [daySoldBusy, setDaySoldBusy] = useState(false)
  const [daySalesOpen, setDaySalesOpen] = useState(false)
  const [daySalesTick, setDaySalesTick] = useState(0)
  const [otaViewBlock, setOtaViewBlock] = useState<string | null>(null)

  const showOtaSeatView = eventHasOtaSeatView(activeEvent)

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7500/ingest/19379df4-9811-4df9-970f-970d9b07ac55', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '0c7e1f',
      },
      body: JSON.stringify({
        sessionId: '0c7e1f',
        hypothesisId: 'H-3d-visibility',
        location: 'App.tsx:ota-seat-view',
        message: '3D link gate evaluated',
        data: {
          showOtaSeatView,
          activeSlug: activeEvent?.slug ?? null,
          isStaff,
          eventCount: events.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }, [showOtaSeatView, activeEvent?.slug, isStaff, events.length])

  useEffect(() => {
    if (authLoading || isStaff) return
    // #region agent log
    fetch('http://127.0.0.1:7500/ingest/19379df4-9811-4df9-970f-970d9b07ac55', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '0c7e1f',
      },
      body: JSON.stringify({
        sessionId: '0c7e1f',
        hypothesisId: 'H-public-visitor',
        location: 'App.tsx:public-view',
        message: 'public visitor session',
        data: { isDemo, hasSupabase: isSupabaseConfigured },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }, [authLoading, isStaff, isDemo])

  const stats = useMemo(() => {
    let available = 0
    let daySold = 0
    let preSold = 0
    for (const s of seatsWithState) {
      if (!isSeatSellable(s)) continue
      if (s.state.status === 'available') available++
      else if (s.state.status === 'daysold') daySold++
      else if (s.state.status === 'presold') preSold++
    }
    const total = seatsWithState.filter((s) => isSeatSellable(s)).length
    return { available, daySold, preSold, sold: daySold + preSold, total }
  }, [seatsWithState])

  const daySaleLogCount = useMemo(() => {
    void daySalesTick
    return activeEvent ? countDaySales(activeEvent.slug) : 0
  }, [activeEvent?.slug, daySalesTick])

  const handleSeatClick = (seat: SeatWithState) => {
    if (
      showOtaSeatView &&
      isStaff &&
      isSeatSellable(seat) &&
      activeEvent?.slug
    ) {
      setOtaStaffChoiceSeat(seat)
      return
    }
    setSelectedSeat(seat)
  }

  const handleMarkDaySold = async (seat: SeatWithState) => {
    setDaySoldBusy(true)
    await handleSaveSeat(seat.id, seat.effectiveAllocation, 'daysold', null)
    setDaySoldBusy(false)
    setOtaStaffChoiceSeat(null)
  }

  const handleSaveSeat = async (
    seatId: string,
    allocation: SeatWithState['effectiveAllocation'],
    status: Parameters<typeof upsertSeatState>[2],
    note: string | null,
  ) => {
    const seat = seatsWithState.find(
      (s) => s.id === seatId && s.effectiveAllocation === allocation,
    )
    const wasDaySold = seat?.state.status === 'daysold'
    const { error } = await upsertSeatState(seatId, allocation, status, note)
    if (error) {
      alert('保存に失敗しました: ' + error.message)
      return
    }
    if (
      status === 'daysold' &&
      !wasDaySold &&
      seat &&
      activeEvent?.slug
    ) {
      appendDaySale({
        event_slug: activeEvent.slug,
        seat_id: seatId,
        label: seat.label,
        category: seat.category ?? null,
        zone: seat.zone,
        allocation,
        note,
      })
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-3 py-3 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-slate-800 sm:text-xl">
              第78回全日本大学バスケットボール選手権大会 会場席状況
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <SharePublicLink />
              {isStaff && isDemo && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">
                  デモ（スタッフ用）
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
                  className="text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
                >
                  スタッフログイン
                </button>
              )}
            </div>
          </div>

          {isStaff && showOtaSeatView && (
            <p className="text-xs text-emerald-800">
              指定席タップ →「当日券を販売した」で記録（前売りはCSV）。
            </p>
          )}

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
            {showOtaSeatView && (
              <a
                href={OTA_SEAT_VIEW_PATH}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-blue-600 px-4 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                席からの見え方（3D）
              </a>
            )}
            {swapActive && (
              <GenderViewToggle value={genderView} onChange={setGenderView} />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={highlightAvailable}
                onChange={(e) => setHighlightAvailable(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              案内モード（まだ売れていない席だけ強調）
            </label>
            <span className="ml-auto flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {isStaff ? (
                <>
                  <span>
                    案内可 {stats.available} / 当日券 {stats.daySold} / 前売{' '}
                    {stats.preSold} / 全 {stats.total}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDaySalesOpen(true)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    当日券集計（{daySaleLogCount}件）
                  </button>
                </>
              ) : (
                <span>
                  案内可 {stats.available} / 販売済 {stats.sold} / 全{' '}
                  {stats.total}
                </span>
              )}
            </span>
          </div>
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
            onSeatClick={handleSeatClick}
            onOtaBlockPick={
              showOtaSeatView && !isStaff ? setOtaViewBlock : undefined
            }
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

      <OtaStaffSeatChoiceModal
        seat={otaStaffChoiceSeat}
        eventSlug={activeEvent?.slug ?? ''}
        busy={daySoldBusy}
        onClose={() => setOtaStaffChoiceSeat(null)}
        onMarkDaySold={() => {
          if (otaStaffChoiceSeat) void handleMarkDaySold(otaStaffChoiceSeat)
        }}
        onEditStatus={() => {
          if (otaStaffChoiceSeat) setSelectedSeat(otaStaffChoiceSeat)
          setOtaStaffChoiceSeat(null)
        }}
        onOpen3d={() => {
          if (otaStaffChoiceSeat) {
            const block = otaBlockForSeat(otaStaffChoiceSeat)
            if (block) setOtaViewBlock(block)
          }
          setOtaStaffChoiceSeat(null)
        }}
      />

      <SeatDetailModal
        seat={selectedSeat}
        eventSlug={activeEvent?.slug ?? ''}
        genderView={genderView}
        onClose={() => setSelectedSeat(null)}
        isStaff={isStaff}
        onSave={handleSaveSeat}
        onPreview3d={
          showOtaSeatView && isStaff && selectedSeat
            ? () => {
                const block = otaBlockForSeat(selectedSeat)
                if (block) setOtaViewBlock(block)
              }
            : undefined
        }
      />

      <OtaSeatViewModal
        block={otaViewBlock}
        onClose={() => setOtaViewBlock(null)}
      />

      <StaffDaySalesModal
        open={daySalesOpen}
        onClose={() => setDaySalesOpen(false)}
        events={events}
        activeSlug={activeEvent?.slug ?? ''}
      />
    </div>
  )
}

export default App
