import { eventHasOtaSeatView } from './otaSeatView'
import type { VenueEvent } from '../types'

/** 大田: 縦PDFのみ CSS で東側を上に回転。横向きPDFはそのまま */
export function otaMapLandscapeLayout(
  event: Pick<VenueEvent, 'slug' | 'title' | 'map_width' | 'map_height'>,
): boolean {
  if (!eventHasOtaSeatView(event)) return false
  return event.map_height > event.map_width
}

export function otaLayoutSize(mapW: number, mapH: number, landscape: boolean) {
  return landscape
    ? { layoutW: mapH, layoutH: mapW }
    : { layoutW: mapW, layoutH: mapH }
}

/** 席矩形（PDF正規化座標）→ 横向き表示用 */
export function otaSeatBoxNorm(seat: {
  x: number
  y: number
  w: number
  h: number
}) {
  return {
    x: 1 - seat.y - seat.h,
    y: seat.x,
    w: seat.h,
    h: seat.w,
  }
}

/** 横向きビューポート上の正規化座標 → PDF／ブロック判定用 */
export function otaLayoutNormToMapNorm(lx: number, ly: number) {
  return { x: ly, y: 1 - lx }
}
