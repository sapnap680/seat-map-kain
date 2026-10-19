import { seatDisplayTitle } from '../lib/allocation'
import { statusLabelForDisplay } from '../lib/seatStatus'
import type { SeatWithState } from '../types'

type Props = {
  seat: SeatWithState | null
  eventSlug: string
  onClose: () => void
  onMarkDaySold: () => void
  onOpen3d: () => void
  onResetAvailable: () => void
  busy?: boolean
  resetBusy?: boolean
}

export function OtaStaffSeatChoiceModal({
  seat,
  eventSlug,
  onClose,
  onMarkDaySold,
  onOpen3d,
  onResetAvailable,
  busy = false,
  resetBusy = false,
}: Props) {
  if (!seat) return null

  const sold = seat.state.status === 'daysold' || seat.state.status === 'presold'
  const canReset =
    seat.state.status === 'daysold' || seat.state.status === 'hold'

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="max-w-full truncate text-lg font-bold text-slate-800">
              {seatDisplayTitle(seat, eventSlug)}
            </h2>
            {seat.category && (
              <p className="truncate text-sm text-slate-500">{seat.category}</p>
            )}
            <p className="mt-1 text-sm text-slate-600">
              現在：{statusLabelForDisplay(seat.state.status)}
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

        <div className="mt-4 flex flex-col gap-2">
          {!sold && (
            <button
              type="button"
              disabled={busy}
              onClick={onMarkDaySold}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? '保存中…' : '当日券を販売した'}
            </button>
          )}
          <button
            type="button"
            onClick={onOpen3d}
            className="w-full rounded-lg border border-blue-600 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            3Dで席からの見え方を案内
          </button>
          {canReset && (
            <button
              type="button"
              disabled={resetBusy}
              onClick={onResetAvailable}
              className="w-full rounded-lg border border-slate-300 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {resetBusy ? '保存中…' : '案内可に戻す'}
            </button>
          )}
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
