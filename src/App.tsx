import { useEffect, useMemo, useState } from 'react'
import { GenderViewToggle } from './components/GenderViewToggle'
import { StaffDaySalesModal } from './components/StaffDaySalesModal'
import { OtaStaffSeatChoiceModal } from './components/OtaStaffSeatChoiceModal'
import { OtaSeatViewModal } from './components/OtaSeatViewModal'
import { SeatDetailModal } from './components/SeatDetailModal'
import { SeatMap } from './components/SeatMap'
import { StaffLoginModal } from './components/StaffLoginModal'
import { useAuth } from './hooks/useAuth'
import { useEvents, useSeatMap } from './hooks/useEventData'
import { eventHasGenderSwap, eventTabLabel } from './lib/allocation'
import { otaBlockForSeatOrDefault } from './lib/otaBlockMap'
import {
  eventHasOtaSeatView,
  OTA_SEAT_VIEW_PATH,
} from './lib/otaSeatView'
import { appendDaySale } from './lib/daySaleLog'
import { useDaySales } from './hooks/useDaySales'
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

  const { isStaff, signIn, signOut, isDemo, loading: authLoading } =
    useAuth()
  const [genderView, setGenderView] = useState<GenderView>('women')
  const swapActive = activeEvent
    ? eventHasGenderSwap(activeEvent.slug)
    : false

  useEffect(() => {
    setGenderView('women')
  }, [activeEvent?.slug])

  const {
    seatsWithState,
    loading: seatsLoading,
    upsertSeatState,
    clearSeatState,
  } = useSeatMap(activeEvent?.id ?? null, activeEvent?.slug ?? null, genderView)

  const [highlightAvailable, setHighlightAvailable] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [selectedSeat, setSelectedSeat] = useState<SeatWithState | null>(null)
  const [otaStaffChoiceSeat, setOtaStaffChoiceSeat] =
    useState<SeatWithState | null>(null)
  const [daySoldBusy, setDaySoldBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [daySalesOpen, setDaySalesOpen] = useState(false)
  const { records: daySaleRecords, count: daySaleLogCount } = useDaySales(
    activeEvent?.slug,
  )
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

  const handleResetAvailable = async (
    seatId: string,
    allocation: SeatWithState['effectiveAllocation'],
  ) => {
    const { error } = await clearSeatState(seatId, allocation)
    if (error) alert('案内可に戻せませんでした: ' + error.message)
  }

  const openOta3dForSeat = (seat: SeatWithState) => {
    setSelectedSeat(null)
    setOtaStaffChoiceSeat(null)
    setOtaViewBlock(otaBlockForSeatOrDefault(seat))
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
      const { error: logError } = await appendDaySale({
        event_slug: activeEvent.slug,
        seat_id: seatId,
        label: seat.label,
        category: seat.category ?? null,
        zone: seat.zone,
        allocation,
        note,
      })
      if (logError) {
        alert(
          '席は当日券にしましたが、集計ログの保存に失敗しました: ' +
            logError.message,
        )
      }
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-6xl px-3 py-2.5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <h1 className="max-w-xl text-[11px] font-semibold leading-snug text-slate-800 sm:text-xs">
              第78回全日本大学バスケットボール選手権大会
              <span className="font-normal text-slate-500"> 会場席状況</span>
            </h1>
            <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
              {isStaff ? (
                <>
                  <span className="text-emerald-700">編集中</span>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50"
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

          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
            <div
              className="inline-flex rounded-lg bg-slate-100 p-0.5"
              role="tablist"
              aria-label="会場日"
            >
              {events.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  role="tab"
                  aria-selected={activeEvent?.id === ev.id}
                  onClick={() => setActiveSlug(ev.slug)}
                  className={`rounded-md px-3 py-1 text-xs font-medium tabular-nums transition-colors ${
                    activeEvent?.id === ev.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {eventTabLabel(ev)}
                </button>
              ))}
            </div>
            {showOtaSeatView && (
              <a
                href={OTA_SEAT_VIEW_PATH}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
              >
                3D席ビュー
              </a>
            )}
            {swapActive && (
              <GenderViewToggle value={genderView} onChange={setGenderView} />
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
              <input
                type="checkbox"
                checked={highlightAvailable}
                onChange={(e) => setHighlightAvailable(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              残席のみ
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {isStaff ? (
                <>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 tabular-nums">
                    案内可 {stats.available}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 tabular-nums">
                    当日券 {stats.daySold}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 tabular-nums">
                    前売 {stats.preSold}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 tabular-nums">
                    全 {stats.total}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDaySalesOpen(true)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    集計 {daySaleLogCount}
                  </button>
                </>
              ) : (
                <>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 tabular-nums">
                    案内可 {stats.available}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 tabular-nums">
                    販売済 {stats.sold}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 tabular-nums">
                    全 {stats.total}
                  </span>
                </>
              )}
            </div>
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
        onResetAvailable={() => {
          if (!otaStaffChoiceSeat) return
          setResetBusy(true)
          void handleResetAvailable(
            otaStaffChoiceSeat.id,
            otaStaffChoiceSeat.effectiveAllocation,
          ).finally(() => {
            setResetBusy(false)
            setOtaStaffChoiceSeat(null)
          })
        }}
        resetBusy={resetBusy}
        onOpen3d={() => {
          if (otaStaffChoiceSeat) openOta3dForSeat(otaStaffChoiceSeat)
        }}
      />

      <SeatDetailModal
        seat={selectedSeat}
        eventSlug={activeEvent?.slug ?? ''}
        genderView={genderView}
        onClose={() => setSelectedSeat(null)}
        isStaff={isStaff}
        onSave={handleSaveSeat}
        onResetAvailable={handleResetAvailable}
        onPreview3d={
          showOtaSeatView && selectedSeat
            ? () => openOta3dForSeat(selectedSeat)
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
        seats={seatsWithState}
        dayRecords={daySaleRecords}
      />
    </div>
  )
}

export default App
