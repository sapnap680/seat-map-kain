import type { VenueEvent } from '../types'

const OTA_SLUGS = new Set(['2025-12-12', '2025-12-13'])

/** 大田（最終2日）で 3D 席ビューを出す日 */
export function eventHasOtaSeatView(
  event: Pick<VenueEvent, 'slug' | 'title'> | null,
): boolean {
  if (!event) return false
  if (OTA_SLUGS.has(event.slug)) return true
  return /12[/._]12|12[/._]13|大田/.test(event.title)
}

export const OTA_SEAT_VIEW_PATH = '/ota-seat-view.html'
