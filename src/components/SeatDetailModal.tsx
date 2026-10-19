import { useState } from 'react'
import { allocationDisplayLabel, seatDisplayTitle } from '../lib/allocation'
import { isSeatSellable, statusLabelForDisplay } from '../lib/seatStatus'
import type { GenderView, SeatStatus, SeatWithState } from '../types'

type Props = {
  seat: SeatWithState | null
  eventSlug: string
  genderView: GenderView
  onClose: () => void
  isStaff: boolean
  onSave: (
    seatId: string,
    allocation: SeatWithState['effectiveAllocation'],
    status: SeatStatus,
    note: string | null,
  ) => Promise<void>
  onResetAvailable: (
    seatId: string,
    allocation: SeatWithState['effectiveAllocation'],
  ) => Promise<void>
  onPreview3d?: () => void
}

export function SeatDetailModal({
  seat,
  eventSlug,
  genderView,
  onClose,
  isStaff,
  onSave,
  onResetAvailable,
  onPreview3d,
}: Props) {
  const [busy, setBusy] = useState(false)

  if (!seat) return null

  const sellable = isSeatSellable(seat)
  const status = seat.state.status
  const canReset =
    isStaff &&
    sellable &&
    status !== 'available' &&
    status !== 'presold' &&
    status !== 'blocked'
  const canMarkDaySold =
    isStaff && sellable && status === 'available'

  const markDaySold = async () => {
    setBusy(true)
    await onSave(seat.id, seat.effectiveAllocation, 'daysold', null)
    setBusy(false)
    onClose()
  }

  const resetAvailable = async () => {
    setBusy(true)
    await onResetAvailable(seat.id, seat.effectiveAllocation)
    setBusy(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="max-w-full truncate text-lg font-bold text-slate-800 sm:text-xl">
              {seatDisplayTitle(seat, eventSlug)}
            </h2>
            {seat.category && (
              <p className="truncate text-sm text-slate-500">{seat.category}</p>
            )}
            <p className="text-sm text-violet-700">
              {allocationDisplayLabel(
                seat,
                eventSlug,
                genderView,
                seat.effectiveAllocation,
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          現在：{statusLabelForDisplay(status)}
        </p>

        {onPreview3d && (
          <button
            type="button"
            onClick={onPreview3d}
            className="mt-3 w-full rounded-lg border border-blue-600 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            この付近の席からの見え方（3D）
          </button>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {canMarkDaySold && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void markDaySold()}
              className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? '保存中…' : '当日券を販売した'}
            </button>
          )}
          {canReset && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void resetAvailable()}
              className="w-full rounded-lg border border-slate-300 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? '保存中…' : '案内可に戻す'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-slate-200 py-2.5 text-slate-600 hover:bg-slate-50"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  )
}
