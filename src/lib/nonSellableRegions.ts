import { INCARE, INCARE_LABELS } from './incarePalette'
import type { Seat, SeatZone } from '../types'

export type NormRect = { x: number; y: number; w: number; h: number }

/** 図面上の枠ラベル。販売しませんは出さない。駒沢2階だけ当日販売。 */
export function overlayLabel(slug: string, zone: SeatZone): string | null {
  if (slug === '2025-12-11' && zone === 'floor2') return '当日販売します'
  if (zone === 'team_ticket') return INCARE_LABELS.teamTicket
  return null
}

export function nonSellableZoneStyle(zone: SeatZone): {
  borderColor: string
} {
  if (zone === 'team_ticket') {
    return { borderColor: INCARE.teamTicket }
  }
  return { borderColor: INCARE.seatGray }
}

function otaTeamZone(cx: number, cy: number): boolean {
  if (cx < 0.62) return false
  return cy >= 0.275 && cy <= 0.785
}

/** オーバーレイ用: 会場ごとに席データを絞り込み（範囲のずれ防止） */
export function seatsForNonSellableOverlay(
  slug: string,
  zone: SeatZone,
  seats: Pick<Seat, 'x' | 'y' | 'w' | 'h' | 'zone'>[],
): Pick<Seat, 'x' | 'y' | 'w' | 'h' | 'zone'>[] {
  const z = seats.filter((s) => s.zone === zone)
  if (slug === '2025-12-11' && zone === 'floor2') {
    return z.filter((s) => s.y + s.h / 2 >= 0.86)
  }
  if (
    (slug === '2025-12-12' || slug === '2025-12-13') &&
    zone === 'team_ticket'
  ) {
    return z.filter((s) => {
      const cx = s.x + s.w / 2
      const cy = s.y + s.h / 2
      return otaTeamZone(cx, cy)
    })
  }
  return z
}

export function mergeOptionsForOverlay(
  slug: string,
  zone: SeatZone,
): { gap: number; maxVerticalSep: number } {
  if (
    (slug === '2025-12-12' || slug === '2025-12-13') &&
    zone === 'team_ticket'
  ) {
    return { gap: 0.008, maxVerticalSep: 0.03 }
  }
  if (slug === '2025-12-11' && zone === 'team_ticket') {
    return { gap: 0.006, maxVerticalSep: 0.025 }
  }
  return { gap: 0.012, maxVerticalSep: 0.04 }
}

type Box = { x0: number; y0: number; x1: number; y1: number }

function boxesCanMerge(a: Box, b: Box, gap: number, maxVerticalSep: number): boolean {
  const ax0 = a.x0 - gap
  const ay0 = a.y0 - gap
  const ax1 = a.x1 + gap
  const ay1 = a.y1 + gap
  const bx0 = b.x0 - gap
  const by0 = b.y0 - gap
  const bx1 = b.x1 + gap
  const by1 = b.y1 + gap
  const overlaps =
    ax0 <= bx1 && ax1 >= bx0 && ay0 <= by1 && ay1 >= by0
  if (overlaps) return true
  const hOverlap = ax0 <= bx1 && ax1 >= bx0
  if (!hOverlap) return false
  const vSep =
    b.y0 > a.y1
      ? b.y0 - a.y1
      : a.y0 > b.y1
        ? a.y0 - b.y1
        : 0
  return vSep <= maxVerticalSep
}

/** 非販売席矩形を近接クラスタにまとめる（縦に離れた段は別ラベル） */
export function mergeSeatRectsByZone(
  seats: Pick<Seat, 'x' | 'y' | 'w' | 'h' | 'zone'>[],
  zone: SeatZone,
  gap = 0.012,
  maxVerticalSep = 0.04,
): NormRect[] {
  let boxes: Box[] = seats
    .filter((s) => s.zone === zone)
    .map((s) => ({
      x0: s.x,
      y0: s.y,
      x1: s.x + s.w,
      y1: s.y + s.h,
    }))

  let merged = true
  while (merged && boxes.length > 1) {
    merged = false
    const next: Box[] = []
    const used = new Set<number>()
    for (let i = 0; i < boxes.length; i++) {
      if (used.has(i)) continue
      let cur = boxes[i]
      for (let j = i + 1; j < boxes.length; j++) {
        if (used.has(j)) continue
        const other = boxes[j]
        if (boxesCanMerge(cur, other, gap, maxVerticalSep)) {
          cur = {
            x0: Math.min(cur.x0, other.x0),
            y0: Math.min(cur.y0, other.y0),
            x1: Math.max(cur.x1, other.x1),
            y1: Math.max(cur.y1, other.y1),
          }
          used.add(j)
          merged = true
        }
      }
      used.add(i)
      next.push(cur)
    }
    boxes = next
  }

  return boxes.map((b) => ({
    x: Math.max(0, b.x0),
    y: Math.max(0, b.y0),
    w: Math.min(1, b.x1) - Math.max(0, b.x0),
    h: Math.min(1, b.y1) - Math.max(0, b.y0),
  }))
}

export function nonSellableZonesForEvent(slug: string): SeatZone[] {
  if (slug === '2025-12-11') return ['team_ticket', 'floor2']
  if (slug === '2025-12-12' || slug === '2025-12-13') return ['team_ticket']
  return []
}
