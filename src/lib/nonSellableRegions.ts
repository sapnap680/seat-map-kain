import type { Seat, SeatZone } from '../types'

export type NormRect = { x: number; y: number; w: number; h: number }

export const NON_SELLABLE_ZONE_LABEL: Partial<Record<SeatZone, string>> = {
  floor2: '2階席・販売しません',
  team_ticket: 'チーム席・販売しません',
}

/** 非販売席矩形を近接クラスタにまとめ、ラベル用の大きな枠にする */
export function mergeSeatRectsByZone(
  seats: Pick<Seat, 'x' | 'y' | 'w' | 'h' | 'zone'>[],
  zone: SeatZone,
  gap = 0.014,
): NormRect[] {
  type Box = { x0: number; y0: number; x1: number; y1: number }
  let boxes: Box[] = seats
    .filter((s) => s.zone === zone)
    .map((s) => ({
      x0: s.x - gap,
      y0: s.y - gap,
      x1: s.x + s.w + gap,
      y1: s.y + s.h + gap,
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
        const overlaps =
          cur.x0 <= other.x1 &&
          cur.x1 >= other.x0 &&
          cur.y0 <= other.y1 &&
          cur.y1 >= other.y0
        if (overlaps) {
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
  if (slug === '2025-12-11') return ['floor2']
  if (slug === '2025-12-12' || slug === '2025-12-13') return ['team_ticket']
  return []
}
