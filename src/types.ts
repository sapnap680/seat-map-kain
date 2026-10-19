export type SeatStatus =
  | 'available'
  | 'presold'
  | 'daysold'
  | 'hold'
  | 'blocked'

/** 1階は終日共通。最終2日のコートサイド/エンド/スペシャルは男子・女子で在庫分離 */
export type SeatZone =
  | 'floor1'
  | 'floor2'
  | 'team_ticket'
  | 'courtside'
  | 'end'
  | 'special'

export type GenderView = 'men' | 'women'

export type AllocationContext = 'all_day' | 'men' | 'women'

export interface VenueEvent {
  id: string
  slug: string
  title: string
  /** 表示は PDF 原稿を優先（色再現） */
  pdf_path: string
  /** PNG フォールバック（任意） */
  background_path?: string
  map_width: number
  map_height: number
}

export interface Seat {
  id: string
  event_id: string
  label: string
  section: string | null
  /** 3D会場図と同じ券種名（大田プレミアム席など） */
  category?: string
  zone: SeatZone
  /** false = 2階・チーム席など販売対象外 */
  sellable?: boolean
  x: number
  y: number
  w: number
  h: number
}

export interface SeatState {
  seat_id: string
  allocation: AllocationContext
  status: SeatStatus
  note: string | null
  updated_at: string
}

export interface SeatWithState extends Seat {
  state: SeatState
  /** 現在の試合日・男女表示で有効な allocation */
  effectiveAllocation: AllocationContext
}
