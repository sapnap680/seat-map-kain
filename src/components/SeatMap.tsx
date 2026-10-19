import { useCallback, useEffect, useRef, useState } from 'react'
import { otaBlockAtNorm, otaBlockForSeat } from '../lib/otaBlockMap'
import { isOtaVisitorClickTarget } from '../lib/otaSeatClick'
import { eventHasOtaSeatView } from '../lib/otaSeatView'
import { seatDisplayTitle } from '../lib/allocation'
import { isSeatSellable, isSold, seatOverlayClass } from '../lib/seatStatus'
import type { SeatWithState, VenueEvent } from '../types'

type Props = {
  event: VenueEvent
  seats: SeatWithState[]
  highlightAvailableOnly: boolean
  isStaff: boolean
  onSeatClick: (seat: SeatWithState) => void
  onOtaBlockPick?: (block: string) => void
}

export function SeatMap({
  event,
  seats,
  highlightAvailableOnly,
  isStaff,
  onSeatClick,
  onOtaBlockPick,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [bgFailed, setBgFailed] = useState(false)
  const [bgCacheKey, setBgCacheKey] = useState<string>('')

  const otaEvent = eventHasOtaSeatView(event)
  const otaVisitor = otaEvent && !isStaff && !!onOtaBlockPick
  const otaStaffPick = otaEvent && isStaff

  useEffect(() => {
    setBgFailed(false)
    let cancelled = false
    fetch(`/backgrounds/${event.slug}.meta.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((meta: { asset_sha?: string } | null) => {
        if (cancelled) return
        const key =
          typeof meta?.asset_sha === 'string' && meta.asset_sha
            ? meta.asset_sha
            : event.slug
        setBgCacheKey(key)
        // #region agent log
        fetch(
          'http://127.0.0.1:7500/ingest/19379df4-9811-4df9-970f-970d9b07ac55',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Debug-Session-Id': '0c7e1f',
            },
            body: JSON.stringify({
              sessionId: '0c7e1f',
              hypothesisId: 'H6',
              location: 'SeatMap.tsx:bg-meta',
              message: 'background cache key loaded',
              data: { slug: event.slug, assetSha: key },
              timestamp: Date.now(),
            }),
          },
        ).catch(() => {})
        // #endregion
      })
      .catch(() => {
        if (!cancelled) setBgCacheKey(event.slug)
      })
    return () => {
      cancelled = true
    }
  }, [event.background_path, event.slug])

  const clientToNorm = useCallback((clientX: number, clientY: number) => {
    const el = mapRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    }
  }, [])

  const pickOtaBlockAt = useCallback(
    (clientX: number, clientY: number) => {
      const p = clientToNorm(clientX, clientY)
      if (!p || !onOtaBlockPick) return
      const block = otaBlockAtNorm(p.x, p.y)
      if (!block) return
      // #region agent log
      fetch(
        'http://127.0.0.1:7500/ingest/19379df4-9811-4df9-970f-970d9b07ac55',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': '0c7e1f',
          },
          body: JSON.stringify({
            sessionId: '0c7e1f',
            hypothesisId: 'H-ota-3d-click',
            location: 'SeatMap.tsx:ota-block-pick',
            message: 'visitor opened 3D block from map',
            data: { block, nx: p.x, ny: p.y, slug: event.slug },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {})
      // #endregion
      onOtaBlockPick(block)
    },
    [clientToNorm, event.slug, onOtaBlockPick],
  )

  const bgBase =
    event.background_path ?? `/backgrounds/${event.slug}.png`
  const bgSrc = bgCacheKey ? `${bgBase}?v=${bgCacheKey}` : bgBase

  const seatClickable = (seat: SeatWithState) => {
    if (otaVisitor || otaStaffPick) {
      return isOtaVisitorClickTarget(event.slug, seat)
    }
    return isSeatSellable(seat)
  }

  return (
    <div className="flex min-h-[50vh] flex-1 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex-1 overflow-auto p-2">
        <div className="mx-auto inline-block max-w-full align-top">
          <div
            ref={mapRef}
            className={`relative ${otaVisitor || otaStaffPick ? 'cursor-pointer' : ''}`}
            onClick={(e) => {
              if (!otaVisitor) return
              if ((e.target as HTMLElement).closest('[data-seat-hit]')) return
              pickOtaBlockAt(e.clientX, e.clientY)
            }}
          >
            {!bgFailed ? (
              <img
                src={bgSrc}
                alt="会場席図"
                width={event.map_width}
                height={event.map_height}
                className="block h-auto max-w-full pointer-events-none select-none"
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
                if (!seatClickable(seat)) {
                  return null
                }

                const sellable = isSeatSellable(seat)
                const status = seat.state.status
                const overlay = seatOverlayClass(
                  seat,
                  status,
                  highlightAvailableOnly,
                  isStaff,
                )

                const showVisibleOverlay =
                  isSold(status) || status === 'hold'

                const hitProps = {
                  'data-seat-hit': '1' as const,
                  style: {
                    left: `${seat.x * 100}%`,
                    top: `${seat.y * 100}%`,
                    width: `${seat.w * 100}%`,
                    height: `${seat.h * 100}%`,
                  },
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation()
                    if (otaVisitor && onOtaBlockPick) {
                      const block = otaBlockForSeat(seat)
                      if (block) {
                        onOtaBlockPick(block)
                        return
                      }
                    }
                    onSeatClick(seat)
                  },
                }

                if (
                  status === 'available' &&
                  !highlightAvailableOnly &&
                  !showVisibleOverlay
                ) {
                  return (
                    <div
                      key={seat.id}
                      role="button"
                      tabIndex={0}
                      title={seatDisplayTitle(seat, event.slug)}
                      className="pointer-events-auto absolute cursor-pointer opacity-0 touch-manipulation"
                      {...hitProps}
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
                      className={`pointer-events-auto absolute cursor-pointer touch-manipulation ${overlay}`}
                      {...hitProps}
                    />
                  )
                }

                if (!showVisibleOverlay && !(otaVisitor || otaStaffPick)) {
                  return null
                }

                if (!showVisibleOverlay && (otaVisitor || otaStaffPick)) {
                  return (
                    <div
                      key={seat.id}
                      role="button"
                      tabIndex={0}
                      title={seatDisplayTitle(seat, event.slug)}
                      className="pointer-events-auto absolute cursor-pointer opacity-0 touch-manipulation"
                      {...hitProps}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onSeatClick(seat)
                      }}
                    />
                  )
                }

                return (
                  <button
                    key={seat.id}
                    type="button"
                    title={seatDisplayTitle(seat, event.slug)}
                    className={`pointer-events-auto absolute touch-manipulation ${overlay}`}
                    {...hitProps}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
