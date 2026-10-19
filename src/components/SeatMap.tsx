import { useCallback, useRef, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { eventHasGenderSwap, isSwappableZone } from '../lib/allocation'
import { isSold, seatFillClass } from '../lib/seatStatus'
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

  const mapBody = (
    <div
      ref={mapRef}
      className="relative mx-auto select-none bg-slate-100 shadow-inner"
      style={{
        width: '100%',
        maxWidth: event.map_width,
        aspectRatio: `${event.map_width} / ${event.map_height}`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {!bgFailed ? (
        <img
          src={event.background_path}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-fill"
          onError={() => setBgFailed(true)}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-200 text-sm text-slate-600">
          会場図を読み込めませんでした
        </div>
      )}

      {seats.map((seat) => {
        const preview = movePreview?.[seat.id]
        const sx = preview?.x ?? seat.x
        const sy = preview?.y ?? seat.y
        const available = seat.state.status === 'available'
        const sold = isSold(seat.state.status)
        const blocked = seat.state.status === 'blocked'
        const swapDay = eventHasGenderSwap(event.slug)
        const ring =
          swapDay && seat.zone === 'floor1'
            ? 'ring-1 ring-sky-400'
            : swapDay && isSwappableZone(seat.zone)
              ? 'ring-1 ring-violet-300'
              : ''

        let visibility =
          'opacity-90 hover:opacity-100'
        if (highlightAvailableOnly) {
          visibility = available
            ? 'z-20 opacity-100 ring-2 ring-emerald-500 shadow-md scale-[1.05]'
            : 'pointer-events-none opacity-0'
        }

        const showLabel = seat.w > 0.012

        return (
          <button
            key={seat.id}
            type="button"
            title={`${seat.label}${seat.state.note ? `: ${seat.state.note}` : ''}`}
            onPointerDown={(e) => startMoveSeat(e, seat)}
            onClick={(e) => {
              e.stopPropagation()
              if (moveLayoutMode) return
              onSeatClick(seat)
            }}
            className={`absolute flex items-center justify-center border text-[8px] font-semibold leading-none transition-all ${seatFillClass(seat.state.status)} ${sold ? 'text-gray-700' : 'text-slate-800'} ${ring} ${visibility} ${moveLayoutMode && isStaff ? 'cursor-move' : ''}`}
            style={{
              left: `${sx * 100}%`,
              top: `${sy * 100}%`,
              width: `${seat.w * 100}%`,
              height: `${seat.h * 100}%`,
              minWidth: highlightAvailableOnly && available ? 6 : 0,
              minHeight: highlightAvailableOnly && available ? 6 : 0,
            }}
          >
            {showLabel && (
              <span className="pointer-events-none truncate px-px">{seat.label}</span>
            )}
            {blocked && !highlightAvailableOnly && (
              <span
                className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,.35)_3px,rgba(255,255,255,.35)_6px)]"
                aria-hidden
              />
            )}
          </button>
        )
      })}

      {pendingRect && (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-blue-500 bg-blue-200/40"
          style={{
            left: `${pendingRect.x * 100}%`,
            top: `${pendingRect.y * 100}%`,
            width: `${pendingRect.w * 100}%`,
            height: `${pendingRect.h * 100}%`,
          }}
        />
      )}
    </div>
  )

  return (
    <div className="relative flex-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <TransformWrapper
        initialScale={0.85}
        minScale={0.15}
        maxScale={6}
        centerOnInit
        wheel={{ step: 0.06 }}
        panning={{ disabled: (placementMode && !!dragStart) || !!moving }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="absolute right-2 top-2 z-30 flex gap-1">
              <button
                type="button"
                onClick={() => zoomIn()}
                className="rounded border border-slate-200 bg-white/95 px-2 py-1 text-sm shadow"
              >
                ＋
              </button>
              <button
                type="button"
                onClick={() => zoomOut()}
                className="rounded border border-slate-200 bg-white/95 px-2 py-1 text-sm shadow"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => resetTransform()}
                className="rounded border border-slate-200 bg-white/95 px-2 py-1 text-xs shadow"
              >
                リセット
              </button>
            </div>
            <TransformComponent
              wrapperClass="!w-full !h-full min-h-[50vh]"
              contentClass="!w-full flex justify-center p-2"
            >
              {mapBody}
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  )
}
