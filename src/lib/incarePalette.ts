/**
 * 78th インカレ料金表 PPTX（座席図）と統一した配色
 * 参照: 78thインカレ料金表_座席図について.pptx
 */
export const INCARE = {
  /** 1階指定席 */
  floor1: '#E38AB2',
  floor1Rgb: '227, 138, 178',
  /** 2階自由席（非販売・案内用） */
  floor2: '#BFBFBF',
  floor2Rgb: '191, 191, 191',
  /** チーム券席 */
  teamTicket: '#92D050',
  teamTicketRgb: '146, 208, 80',
  /** 会場図の灰色席 */
  seatGray: '#7F7F7F',
  /** 販売済オーバーレイ */
  sold: 'rgba(127, 127, 127, 0.55)',
  /** JUBF ロゴ赤（UIアクセント） */
  brandRed: '#E71D1B',
  text: '#262626',
} as const

export const INCARE_LABELS = {
  floor1: '1階指定席',
  floor2: '2階自由席',
  teamTicket: 'チーム券席',
} as const
