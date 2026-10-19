import { GENDER_VIEW_LABELS } from '../lib/allocation'
import type { GenderView } from '../types'

type Props = {
  value: GenderView
  onChange: (v: GenderView) => void
}

export function GenderViewToggle({ value, onChange }: Props) {
  return (
    <div
      className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs"
      role="group"
      aria-label="男子女子の表示切替"
    >
      {(['men', 'women'] as const).map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onChange(g)}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            value === g
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {GENDER_VIEW_LABELS[g]}
        </button>
      ))}
    </div>
  )
}
