import type { Seat, SeatZone } from '../types'

/** ota-seat-view.html の SVG 会場図（viewBox 1080×1072）と同じ座標 */
const MAP_W = 1080
const MAP_H = 1072

/** 12/12–13：ゴール裏 L・C・B は案内・3D対象外 */
export const OTA_NON_PICK_BLOCKS = new Set(['L', 'B', 'C'])

export function isOtaBlockPickable(block: string): boolean {
  return !OTA_NON_PICK_BLOCKS.has(block)
}

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

/** 1階・ゴール裏ブロック（viewBox 1080 基準・会場図の文字付近） */
const STAND_BLOCK_PAD: [number, number, number, number] = [10, 10, 14, 14]

const PAD: Record<string, [number, number, number, number]> = {
  I: STAND_BLOCK_PAD,
  H: STAND_BLOCK_PAD,
  G: STAND_BLOCK_PAD,
  F: STAND_BLOCK_PAD,
  E: STAND_BLOCK_PAD,
  K: STAND_BLOCK_PAD,
  M: STAND_BLOCK_PAD,
  A: STAND_BLOCK_PAD,
  コートサイドA: [6, 6, 18, 24],
  コートサイドB: [6, 6, 24, 18],
  コートエンド: [14, 14, 10, 10],
  スペシャルシート: [12, 12, 20, 20],
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

const STAND_BLOCK_KEYS = new Set([
  'I',
  'H',
  'G',
  'F',
  'E',
  'K',
  'L',
  'M',
  'C',
  'B',
  'A',
])

function blockFromSeatMeta(
  seat: Pick<Seat, 'section' | 'label' | 'category'>,
): string | null {
  const section = seat.section?.trim()
  if (section && STAND_BLOCK_KEYS.has(section)) return section

  const label = seat.label?.trim() ?? ''
  const fromLabel = label.match(/^([A-Z])(?:\d+列|\d+番)/)
  if (fromLabel && STAND_BLOCK_KEYS.has(fromLabel[1])) return fromLabel[1]

  const cat = seat.category ?? ''
  if (cat.includes('コートサイドA')) return 'コートサイドA'
  if (cat.includes('コートサイドB')) return 'コートサイドB'
  if (cat.includes('コートエンド')) return 'コートエンド'
  if (cat.includes('スペシャル')) return 'スペシャルシート'

  return null
}

/** 1階スタンド：横向き座席表PDF上のおおよそのブロック */
function floor1BlockFallback(cx: number, cy: number): string {
  if (cx < 0.22) {
    if (cy < 0.42) return 'M'
    if (cy < 0.58) return 'L'
    return 'K'
  }
  if (cx > 0.78) {
    if (cy < 0.42) return 'A'
    if (cy < 0.58) return 'B'
    return 'C'
  }
  if (cy > 0.72) {
    if (cx < 0.22) return 'I'
    if (cx < 0.35) return 'H'
    if (cx < 0.52) return 'G'
    if (cx < 0.68) return 'F'
    return 'E'
  }
  return 'G'
}

/** 席タップ → 3D会場図のブロック（座標ヒット＋プレミアム席のゾーンフォールバック） */
export function otaBlockForSeat(
  seat: Pick<Seat, 'zone' | 'x' | 'y' | 'w' | 'h' | 'section' | 'label' | 'category'>,
): string | null {
  const fromMeta = blockFromSeatMeta(seat)
  if (fromMeta) return fromMeta

  const cx = seat.x + seat.w / 2
  const cy = seat.y + seat.h / 2
  const fromMap = otaBlockAtNorm(cx, cy)
  if (fromMap) return fromMap

  const zoned = ZONE_BLOCK[seat.zone]
  if (zoned) return zoned

  if (seat.zone === 'courtside') {
    return cx < 0.36 ? 'コートサイドB' : 'コートサイドA'
  }

  if (seat.zone === 'floor1') {
    return floor1BlockFallback(cx, cy)
  }

  return null
}

/** 3D表示用（必ずブロックを返す） */
export function otaBlockForSeatOrDefault(
  seat: Parameters<typeof otaBlockForSeat>[0],
): string {
  return otaBlockForSeat(seat) ?? 'G'
}
