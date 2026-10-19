import type { Seat, SeatZone } from '../types'

/** ota-seat-view.html の SVG 会場図（viewBox 1080×1072）と同じ座標 */
const MAP_W = 1080
const MAP_H = 1072

type Rect = { x: number; y: number; w: number; h: number }

const REG: Record<string, Rect[]> = {
  I: [{ x: 193, y: 200, w: 69, h: 28 }],
  H: [{ x: 193, y: 246, w: 69, h: 169 }],
  G: [{ x: 193, y: 433, w: 69, h: 168 }],
  F: [{ x: 193, y: 619, w: 69, h: 169 }],
  E: [{ x: 193, y: 806, w: 69, h: 29 }],
  K: [{ x: 324, y: 62, w: 119, h: 69 }],
  L: [{ x: 461, y: 62, w: 169, h: 69 }],
  M: [{ x: 648, y: 62, w: 118, h: 69 }],
  C: [{ x: 324, y: 904, w: 119, h: 68 }],
  B: [{ x: 461, y: 904, w: 169, h: 68 }],
  A: [{ x: 648, y: 904, w: 118, h: 68 }],
  コートサイドA: [
    { x: 374, y: 229, w: 14, h: 183 },
    { x: 374, y: 622, w: 14, h: 183 },
  ],
  コートサイドB: [
    { x: 355, y: 244, w: 14, h: 168 },
    { x: 355, y: 425, w: 14, h: 184 },
    { x: 355, y: 622, w: 14, h: 168 },
  ],
  コートエンド: [
    { x: 403, y: 223, w: 81, h: 18 },
    { x: 606, y: 223, w: 81, h: 18 },
    { x: 403, y: 794, w: 81, h: 18 },
    { x: 606, y: 794, w: 81, h: 18 },
  ],
  スペシャルシート: [
    { x: 710, y: 419, w: 14, h: 51 },
    { x: 710, y: 564, w: 14, h: 51 },
  ],
}

const PAD: Record<string, [number, number, number, number]> = {
  コートサイドA: [0, 0, 2, 4],
  コートサイドB: [0, 0, 4, 2],
  コートエンド: [4, 4, 2, 2],
  スペシャルシート: [4, 4, 4, 4],
}

function hitRect(
  px: number,
  py: number,
  r: Rect,
  pad: [number, number, number, number],
): boolean {
  const [pt, pb, pl, pr] = pad
  return (
    px >= r.x - pl &&
    px <= r.x + r.w + pr &&
    py >= r.y - pt &&
    py <= r.y + r.h + pb
  )
}

/** 会場PNG上の正規化座標 (0–1) → 3D会場図のブロックキー */
export function otaBlockAtNorm(nx: number, ny: number): string | null {
  const px = nx * MAP_W
  const py = ny * MAP_H
  for (const [key, rects] of Object.entries(REG)) {
    const pad = PAD[key] ?? [0, 0, 0, 0]
    for (const r of rects) {
      if (hitRect(px, py, r, pad)) return key
    }
  }
  return null
}

export function otaSeatViewUrl(block: string): string {
  const q = new URLSearchParams({ block })
  return `/ota-seat-view.html?${q.toString()}`
}

const ZONE_BLOCK: Partial<Record<SeatZone, string>> = {
  special: 'スペシャルシート',
  end: 'コートエンド',
}

/** 席タップ → 3D会場図のブロック（座標ヒット＋プレミアム席のゾーンフォールバック） */
export function otaBlockForSeat(
  seat: Pick<Seat, 'zone' | 'x' | 'y' | 'w' | 'h'>,
): string | null {
  const cx = seat.x + seat.w / 2
  const cy = seat.y + seat.h / 2
  const fromMap = otaBlockAtNorm(cx, cy) // PDF正規化↔SVGでズレる席は下のゾーン判定へ
  if (fromMap) return fromMap

  const zoned = ZONE_BLOCK[seat.zone]
  if (zoned) return zoned

  if (seat.zone === 'courtside') {
    return cx < 0.36 ? 'コートサイドB' : 'コートサイドA'
  }

  return null
}
