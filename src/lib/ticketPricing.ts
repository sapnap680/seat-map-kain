import type { Seat, SeatZone } from '../types'

/** 78回インカレ料金表（PPTX）に基づく一般席の当日想定価格（円） */
export function ticketPriceYen(
  eventSlug: string,
  seat: Pick<Seat, 'zone' | 'category' | 'section'>,
): number | null {
  const cat = seat.category ?? ''
  const sec = seat.section ?? ''

  if (eventSlug === '2025-12-11') {
    switch (seat.zone) {
      case 'floor1':
        return 3000
      case 'floor2':
        return 2000
      case 'team_ticket':
        return 1600
      default:
        return null
    }
  }

  if (eventSlug === '2025-12-12' || eventSlug === '2025-12-13') {
    switch (seat.zone as SeatZone) {
      case 'special':
        return 10000
      case 'end':
        return 8000
      case 'courtside':
        if (
          cat.includes('コートサイドB') ||
          sec.includes('コートサイドB') ||
          cat.includes('B(2')
        ) {
          return 6000
        }
        return 8000
      case 'floor1':
        if (cat.includes('ゴール裏')) return 4000
        return 5000
      case 'team_ticket':
        return 2400
      case 'floor2':
        return 3000
      default:
        return null
    }
  }

  return null
}

export function formatTicketPrice(yen: number): string {
  return `¥${yen.toLocaleString('ja-JP')}`
}
