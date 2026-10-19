import { seatDisplayTitle } from '../lib/allocation'
import { STATUS_LABELS } from '../lib/seatStatus'
import type { SeatWithState } from '../types'

type Props = {
  seat: SeatWithState | null
  eventSlug: string
  onClose: () => void
  onEditStatus: () => void
  onOpen3d: () => void
}

export function OtaStaffSeatChoiceModal({
  seat,
  eventSlug,
  onClose,
  onEditStatus,
  onOpen3d,
}: Props) {
  if (!seat) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="max-w-full truncate text-lg font-bold text-slate-800">
              {seatDisplayTitle(seat, eventSlug)}
            </h2>
            {seat.category && (
              <p className="truncate text-sm text-slate-500">{seat.category}</p>
            )}
            <p className="mt-1 text-sm text-slate-600">
              現在: {STATUS_LABELS[seat.state.status]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-500">
          販売状態の更新と、3Dの見え方確認のどちらをしますか？
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onEditStatus}
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            販売状態を更新（前売り済・当日済など）
          </button>
          <button
            type="button"
            onClick={onOpen3d}
            className="w-full rounded-lg border border-blue-600 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            3Dで席からの見え方を見る
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
