import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  isOtaBlockPickable,
  otaBlockAtNorm,
  otaBlockForSeat,
} from '../lib/otaBlockMap'
import { isOtaVisitorClickTarget } from '../lib/otaSeatClick'
import {
  otaLayoutNormToMapNorm,
  otaLayoutSize,
  otaMapLandscapeLayout,
} from '../lib/otaMapLayout'
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
  const viewportRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const fitScaleRef = useRef(1)
  const scaleRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null)
  const panStartRef = useRef<{
    cx: number
    cy: number
    px: number
    py: number
  } | null>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [bgFailed, setBgFailed] = useState(false)
  const [bgCacheKey, setBgCacheKey] = useState<string>('')

  const mapW = event.map_width
  const mapH = event.map_height
  const otaLandscape = otaMapLandscapeLayout(event)
  const { layoutW, layoutH } = otaLayoutSize(mapW, mapH, otaLandscape)
  const maxPinchScale = 2

  const computeFitView = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return { scale: 1, x: 0, y: 0 }
    const availW = Math.max(1, vp.clientWidth)
    const fit = Math.min(1, availW / layoutW)
    return {
      scale: fit,
      x: (availW - layoutW * fit) / 2,
      y: 0,
    }
  }, [layoutW])

  const resetView = useCallback(() => {
    const { scale: fit, x, y } = computeFitView()
    fitScaleRef.current = fit
    scaleRef.current = fit
    panRef.current = { x, y }
    setScale(fit)
    setPan({ x, y })
  }, [computeFitView])

  const zoomAt = useCallback(
    (focalClientX: number, focalClientY: number, newScale: number) => {
      const vp = viewportRef.current
      if (!vp) return
      const vr = vp.getBoundingClientRect()
      const fx = focalClientX - vr.left
      const fy = focalClientY - vr.top
      const oldS = scaleRef.current
      const p = panRef.current
      const mx = (fx - p.x) / oldS
      const my = (fy - p.y) / oldS
      const nextPan = {
        x: fx - mx * newScale,
        y: fy - my * newScale,
      }
      panRef.current = nextPan
      scaleRef.current = newScale
      setPan(nextPan)
      setScale(newScale)
    },
    [],
  )

  useLayoutEffect(() => {
    resetView()
  }, [resetView, event.slug])

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    panRef.current = pan
  }, [pan])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const ro = new ResizeObserver(() => {
      if (scaleRef.current <= fitScaleRef.current + 0.001) {
        resetView()
      }
    })
    ro.observe(vp)
    return () => ro.disconnect()
  }, [resetView])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return

    const touchDist = (t: TouchList) => {
      if (t.length < 2) return 0
      const dx = t[1].clientX - t[0].clientX
      const dy = t[1].clientY - t[0].clientY
      return Math.hypot(dx, dy)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        panStartRef.current = null
        pinchStartRef.current = {
          dist: touchDist(e.touches),
          scale: scaleRef.current,
        }
        return
      }
      if (e.touches.length === 1) {
        pinchStartRef.current = null
        const t = e.touches[0]
        panStartRef.current = {
          cx: t.clientX,
          cy: t.clientY,
          px: panRef.current.x,
          py: panRef.current.y,
        }
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartRef.current) {
        const start = pinchStartRef.current
        if (start.dist <= 0) return
        e.preventDefault()
        const ratio = touchDist(e.touches) / start.dist
        const next = start.scale * ratio
        const min = fitScaleRef.current
        const clamped = Math.min(maxPinchScale, Math.max(min, next))
        if (Math.abs(clamped - scaleRef.current) < 1e-5) return
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
        zoomAt(midX, midY, clamped)
        return
      }
      if (e.touches.length === 1 && panStartRef.current) {
        e.preventDefault()
        const start = panStartRef.current
        const t = e.touches[0]
        const nextPan = {
          x: start.px + (t.clientX - start.cx),
          y: start.py + (t.clientY - start.cy),
        }
        panRef.current = nextPan
        setPan(nextPan)
      }
    }

    const onTouchEnd = () => {
      pinchStartRef.current = null
      panStartRef.current = null
    }

    vp.addEventListener('touchstart', onTouchStart, { passive: true })
    vp.addEventListener('touchmove', onTouchMove, { passive: false })
    vp.addEventListener('touchend', onTouchEnd)
    vp.addEventListener('touchcancel', onTouchEnd)
    return () => {
      vp.removeEventListener('touchstart', onTouchStart)
      vp.removeEventListener('touchmove', onTouchMove)
      vp.removeEventListener('touchend', onTouchEnd)
      vp.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [maxPinchScale, zoomAt])

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
      const mapNorm = otaLandscape
        ? otaLayoutNormToMapNorm(p.x, p.y)
        : p
      const block = otaBlockAtNorm(mapNorm.x, mapNorm.y)
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
      if (!isOtaBlockPickable(block)) return
      onOtaBlockPick(block)
    },
    [clientToNorm, event.slug, onOtaBlockPick, otaLandscape],
  )

  const bgBase =
    event.background_path ?? `/backgrounds/${event.slug}.png`
  const bgSrc = bgCacheKey ? `${bgBase}?v=${bgCacheKey}` : bgBase

  /** 席矩形は PDF 座標のまま（背景と同じ inner 上。横向きは CSS 回転で一緒に回る） */
  const seatBoxStyle = (seat: SeatWithState) => ({
    left: `${seat.x * 100}%`,
    top: `${seat.y * 100}%`,
    width: `${seat.w * 100}%`,
    height: `${seat.h * 100}%`,
  })

  const seatClickable = (seat: SeatWithState) => {
    if (otaVisitor || otaStaffPick) {
      if (!isOtaVisitorClickTarget(event.slug, seat)) return false
      const block = otaBlockForSeat(seat)
      if (block && !isOtaBlockPickable(block)) return false
      return true
    }
    return isSeatSellable(seat)
  }

  const atFitView = scale <= fitScaleRef.current + 0.001

  return (
    <div className="flex w-full flex-col rounded-lg border border-slate-200 bg-white">
      <div
        ref={viewportRef}
        className={`seat-map-viewport w-full overflow-hidden p-2 ${
          atFitView ? '' : 'min-h-[45vh] flex-1'
        }`}
        style={
          atFitView
            ? { height: Math.ceil(layoutH * scale + 16) }
            : undefined
        }
      >
        <div
          ref={mapRef}
          className={`seat-map-canvas ${otaVisitor || otaStaffPick ? 'cursor-pointer' : ''}`}
          style={{
            width: layoutW,
            height: layoutH,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
          onClick={(e) => {
            if (!otaVisitor) return
            if ((e.target as HTMLElement).closest('[data-seat-hit]')) return
            pickOtaBlockAt(e.clientX, e.clientY)
          }}
        >
          <div
            className={
              otaLandscape
                ? 'ota-map-landscape-inner relative'
                : 'relative'
            }
            style={{ width: mapW, height: mapH }}
          >
            {!bgFailed ? (
              <img
                src={bgSrc}
                alt="会場席図"
                width={event.map_width}
                height={event.map_height}
                className="seat-map-bg pointer-events-none select-none"
                onError={() => setBgFailed(true)}
                draggable={false}
              />
            ) : (
              <div
                className="flex items-center justify-center bg-slate-200 text-sm text-slate-600"
                style={{
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

                if (isStaff && showVisibleOverlay) {
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      title={seatDisplayTitle(seat, event.slug)}
                      className={`seat-hit-expand pointer-events-auto absolute touch-manipulation ${overlay}`}
                      data-seat-hit="1"
                      style={seatBoxStyle(seat)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSeatClick(seat)
                      }}
                    />
                  )
                }

                const hitProps = {
                  'data-seat-hit': '1' as const,
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation()
                    if (otaVisitor && onOtaBlockPick) {
                      const block = otaBlockForSeat(seat)
                      if (block && isOtaBlockPickable(block)) {
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
                      className="seat-hit-expand pointer-events-auto absolute cursor-pointer opacity-0 touch-manipulation"
                      {...hitProps}
                      style={seatBoxStyle(seat)}
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
                      className={`seat-hit-expand pointer-events-auto absolute cursor-pointer touch-manipulation ${overlay}`}
                      {...hitProps}
                      style={seatBoxStyle(seat)}
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
                      className="seat-hit-expand pointer-events-auto absolute cursor-pointer opacity-0 touch-manipulation"
                      {...hitProps}
                      style={seatBoxStyle(seat)}
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
                    className={`seat-hit-expand pointer-events-auto absolute touch-manipulation ${overlay}`}
                    {...hitProps}
                    style={seatBoxStyle(seat)}
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
