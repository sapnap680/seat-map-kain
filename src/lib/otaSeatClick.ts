import { eventHasOtaSeatView } from './otaSeatView'
import type { Seat, SeatZone } from '../types'

const NON_CLICK: SeatZone[] = ['team_ticket', 'floor2']

/** 大田会場：灰色・チーム券以外はタップ可（案内・3D） */
export function isOtaVisitorClickTarget(
  eventSlug: string,
  seat: Pick<Seat, 'zone'>,
): boolean {
  if (!eventHasOtaSeatView({ slug: eventSlug, title: '' })) return false
  return !NON_CLICK.includes(seat.zone)
}

export function isOtaVisitorClickTargetAt(
  eventSlug: string,
  zone: SeatZone | null,
): boolean {
  if (!zone) return false
  if (!eventHasOtaSeatView({ slug: eventSlug, title: '' })) return false
  return !NON_CLICK.includes(zone)
}
