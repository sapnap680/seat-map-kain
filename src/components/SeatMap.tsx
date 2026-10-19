import { useEffect, useRef, useState } from 'react'
import { isSeatSellable, isSold, seatOverlayClass } from '../lib/seatStatus'
import type { SeatWithState, VenueEvent } from '../types'

type Props = {
  event: VenueEvent
  seats: SeatWithState[]
  highlightAvailableOnly: boolean
  isStaff: boolean
  onSeatClick: (seat: SeatWithState) => void
}

export function SeatMap({
  event,
  seats,
  highlightAvailableOnly,
  isStaff,
  onSeatClick,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [bgFailed, setBgFailed] = useState(false)
  const [bgCacheKey, setBgCacheKey] = useState<string>('')

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

  const bgBase =
    event.background_path ?? `/backgrounds/${event.slug}.png`
  const bgSrc = bgCacheKey ? `${bgBase}?v=${bgCacheKey}` : bgBase

  return (
    <div className="flex min-h-[50vh] flex-1 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex-1 overflow-auto p-2">
        <div className="mx-auto inline-block max-w-full align-top">
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
                const sellable = isSeatSellable(seat)
                const status = seat.state.status
                const sold = isSold(status)

                if (!sellable) {
                  return null
                }

                const overlay = seatOverlayClass(
                  seat,
                  status,
                  highlightAvailableOnly,
                  isStaff,
                )

                const showVisibleOverlay = sold || status === 'hold'

                if (status === 'available' && !highlightAvailableOnly) {
                  return (
                    <div
                      key={seat.id}
                      role="button"
                      tabIndex={0}
                      title={`席 ${seat.label}`}
                      className="pointer-events-auto absolute cursor-pointer opacity-0"
                      style={{
                        left: `${seat.x * 100}%`,
                        top: `${seat.y * 100}%`,
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
                        left: `${seat.x * 100}%`,
                        top: `${seat.y * 100}%`,
                        width: `${seat.w * 100}%`,
                        height: `${seat.h * 100}%`,
                      }}
                      onClick={() => onSeatClick(seat)}
                    />
                  )
                }

                if (!showVisibleOverlay) {
                  return null
                }

                return (
                  <button
                    key={seat.id}
                    type="button"
                    title={`${seat.label}${seat.state.note ? `: ${seat.state.note}` : ''}`}
                    onClick={() => onSeatClick(seat)}
                    className={`pointer-events-auto absolute ${overlay}`}
                    style={{
                      left: `${seat.x * 100}%`,
                      top: `${seat.y * 100}%`,
                      width: `${seat.w * 100}%`,
                      height: `${seat.h * 100}%`,
                    }}
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
