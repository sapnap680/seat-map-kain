import { useCallback, useEffect, useRef, useState } from 'react'
import { isSeatSellable, isSold, seatOverlayClass } from '../lib/seatStatus'
import type { SeatWithState, VenueEvent } from '../types'

type Props = {
  event: VenueEvent
  seats: SeatWithState[]
  highlightAvailableOnly: boolean
  isStaff: boolean
  placementMode: boolean
  moveLayoutMode: boolean
  onSeatClick: (seat: SeatWithState) => void
  onSeatMove: (
    seatId: string,
    geom: { x: number; y: number; w: number; h: number },
  ) => void
  pendingRect: { x: number; y: number; w: number; h: number } | null
  dragStart: { x: number; y: number } | null
  onDragStart: (x: number, y: number) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: () => void
}

export function SeatMap({
  event,
  seats,
  highlightAvailableOnly,
  isStaff,
  placementMode,
  moveLayoutMode,
  onSeatClick,
  onSeatMove,
  pendingRect,
  dragStart,
  onDragStart,
  onDragMove,
  onDragEnd,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [bgFailed, setBgFailed] = useState(false)

  useEffect(() => {
    setBgFailed(false)
  }, [event.background_path, event.slug])

  const [moving, setMoving] = useState<{
    seatId: string
    startX: number
    startY: number
    origX: number
    origY: number
    w: number
    h: number
  } | null>(null)

  const clientToNorm = useCallback(
    (clientX: number, clientY: number) => {
      const el = mapRef.current
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const x = (clientX - rect.left) / rect.width
      const y = (clientY - rect.top) / rect.height
      return { x, y }
    },
    [],
  )

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!placementMode || !isStaff || moving) return
    const p = clientToNorm(e.clientX, e.clientY)
    if (p) onDragStart(p.x, p.y)
  }

  const [movePreview, setMovePreview] = useState<Record<
    string,
    { x: number; y: number }
  > | null>(null)

  const handlePointerMove = (e: React.PointerEvent) => {
    if (moving) {
      const p = clientToNorm(e.clientX, e.clientY)
      if (!p) return
      const dx = p.x - moving.startX
      const dy = p.y - moving.startY
      const x = Math.min(1 - moving.w, Math.max(0, moving.origX + dx))
      const y = Math.min(1 - moving.h, Math.max(0, moving.origY + dy))
      setMovePreview({ [moving.seatId]: { x, y } })
      return
    }
    if (!placementMode || !dragStart) return
    const p = clientToNorm(e.clientX, e.clientY)
    if (p) onDragMove(p.x, p.y)
  }

  const handlePointerUp = () => {
    if (moving) {
      const preview = movePreview?.[moving.seatId]
      if (preview) {
        onSeatMove(moving.seatId, {
          x: preview.x,
          y: preview.y,
          w: moving.w,
          h: moving.h,
        })
      }
      setMovePreview(null)
      setMoving(null)
      return
    }
    if (placementMode && dragStart) onDragEnd()
  }

  const startMoveSeat = (
    e: React.PointerEvent,
    seat: SeatWithState,
  ) => {
    if (!moveLayoutMode || !isStaff) return
    e.stopPropagation()
    e.preventDefault()
    const p = clientToNorm(e.clientX, e.clientY)
    if (!p) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setMoving({
      seatId: seat.id,
      startX: p.x,
      startY: p.y,
      origX: seat.x,
      origY: seat.y,
      w: seat.w,
      h: seat.h,
    })
  }

  const bgSrc =
    event.background_path ?? `/backgrounds/${event.slug}.png`

  return (
    <div className="flex min-h-[50vh] flex-1 flex-col rounded-lg border border-slate-200 bg-white">
      <p className="border-b border-slate-200 px-3 py-1.5 text-xs text-slate-600">
        {event.slug === '2025-12-11'
          ? '駒沢の2階（灰色）は当日販売します。1階は前売り対象です（図面の色そのまま）。'
          : '会場PDFの色そのまま表示します。席の上に色枠は重ねません。'}
      </p>
      <div className="flex-1 overflow-auto p-2">
        <div
          className="mx-auto inline-block max-w-full align-top"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div ref={mapRef} className="relative">
            {!bgFailed ? (
              <img
                src={bgSrc}
                alt="会場席図"
                width={event.map_width}
                height={event.map_height}
                className="block h-auto max-w-full"
                onError={() => setBgFailed(true)}
                draggable={false}
              />
            ) : (
              <div
                className="flex items-center justify-center bg-slate-200 text-sm text-slate-600"
                style={{
                  width: '100%',
                  maxWidth: event.map_width,
                  aspectRatio: `${event.map_width} / ${event.map_height}`,
                }}
              >
                会場図を読み込めませんでした
              </div>
            )}

            <div className="pointer-events-none absolute inset-0">
              {seats.map((seat) => {
                const preview = movePreview?.[seat.id]
                const sx = preview?.x ?? seat.x
                const sy = preview?.y ?? seat.y
                const sellable = isSeatSellable(seat)
                const status = seat.state.status
                const sold = isSold(status)

                if (!sellable && !moveLayoutMode) {
                  return null
                }

                const overlay = seatOverlayClass(
                  seat,
                  status,
                  highlightAvailableOnly,
                  isStaff,
                )

                const showVisibleOverlay =
                  sold || status === 'hold' || status === 'blocked'

                if (
                  status === 'available' &&
                  !highlightAvailableOnly &&
                  !moveLayoutMode
                ) {
                  if (!sellable) return null
                  return (
                    <div
                      key={seat.id}
                      role="button"
                      tabIndex={0}
                      title={`席 ${seat.label}`}
                      className="pointer-events-auto absolute cursor-pointer opacity-0"
                      style={{
                        left: `${sx * 100}%`,
                        top: `${sy * 100}%`,
                        width: `${seat.w * 100}%`,
                        height: `${seat.h * 100}%`,
                      }}
                      onClick={() => onSeatClick(seat)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onSeatClick(seat)
                      }}
                    />
                  )
                }

                if (
                  status === 'available' &&
                  highlightAvailableOnly &&
                  sellable
                ) {
                  return (
                    <div
                      key={seat.id}
                      role="button"
                      tabIndex={0}
                      className={`pointer-events-auto absolute cursor-pointer ${overlay}`}
                      style={{
                        left: `${sx * 100}%`,
                        top: `${sy * 100}%`,
                        width: `${seat.w * 100}%`,
                        height: `${seat.h * 100}%`,
                      }}
                      onClick={() => onSeatClick(seat)}
                    />
                  )
                }

                if (!showVisibleOverlay && !moveLayoutMode) {
                  return null
                }

                return (
                  <button
                    key={seat.id}
                    type="button"
                    title={`${seat.label}${seat.state.note ? `: ${seat.state.note}` : ''}`}
                    onPointerDown={(e) => startMoveSeat(e, seat)}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (moveLayoutMode || !sellable) return
                      onSeatClick(seat)
                    }}
                    className={`pointer-events-auto absolute ${overlay} ${moveLayoutMode && isStaff ? 'cursor-move !opacity-40 hover:!opacity-60' : ''}`}
                    style={{
                      left: `${sx * 100}%`,
                      top: `${sy * 100}%`,
                      width: `${seat.w * 100}%`,
                      height: `${seat.h * 100}%`,
                    }}
                  >
                    {moveLayoutMode && isStaff && (
                      <span className="pointer-events-none text-[8px] opacity-80">
                        {seat.label}
                      </span>
                    )}
                  </button>
                )
              })}

              {pendingRect && (
                <div
                  className="absolute border-2 border-dashed border-blue-500 bg-blue-200/40"
                  style={{
                    left: `${pendingRect.x * 100}%`,
                    top: `${pendingRect.y * 100}%`,
                    width: `${pendingRect.w * 100}%`,
                    height: `${pendingRect.h * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
