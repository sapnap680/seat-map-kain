import { useEffect, useState, type FormEvent } from 'react'
import { allocationDisplayLabel } from '../lib/allocation'
import { isSeatSellable, STAFF_STATUSES, STATUS_LABELS } from '../lib/seatStatus'
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
  onPreview3d?: () => void
}

export function SeatDetailModal({
  seat,
  eventSlug,
  genderView,
  onClose,
  isStaff,
  onSave,
  onPreview3d,
}: Props) {
  const [status, setStatus] = useState<SeatStatus>('available')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (seat) {
      setStatus(seat.state.status)
      setNote(seat.state.note ?? '')
    }
  }, [seat])

  if (!seat) return null

  const sellable = isSeatSellable(seat)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isStaff) return
    setBusy(true)
    await onSave(
      seat.id,
      seat.effectiveAllocation,
      status,
      note.trim() || null,
    )
    setBusy(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-800">席 {seat.label}</h2>
            {seat.section && (
              <p className="text-sm text-slate-500">ブロック {seat.section}</p>
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

        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="font-medium text-slate-700">現在: </span>
          {STATUS_LABELS[seat.state.status]}
          {seat.state.note && (
            <span className="mt-1 block text-slate-600">メモ: {seat.state.note}</span>
          )}
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

        {isStaff && sellable ? (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">状態</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SeatStatus)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                {STAFF_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">メモ（任意）</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="例: 車椅子、押さえ中、通路側"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? '保存中…' : '保存'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-lg border border-slate-300 py-2.5 text-slate-700 hover:bg-slate-50"
          >
            閉じる
          </button>
        )}
      </div>
    </div>
  )
}
