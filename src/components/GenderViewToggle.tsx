import { GENDER_VIEW_LABELS } from '../lib/allocation'
import type { GenderView } from '../types'

type Props = {
  value: GenderView
  onChange: (v: GenderView) => void
}

export function GenderViewToggle({ value, onChange }: Props) {
  return (
    <label className="inline-flex items-center text-xs">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as GenderView)}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        aria-label="男子女子の表示切替"
      >
        {(['women', 'men'] as const).map((g) => (
          <option key={g} value={g}>
            {GENDER_VIEW_LABELS[g]}
          </option>
        ))}
      </select>
    </label>
  )
}
