import type { AllocationContext, SeatState } from '../types'
import { stateStorageKey } from './allocation'

const DEMO_STORAGE_KEY = 'seat-map-demo-states'

function normalizeDemoStates(
  raw: Record<string, SeatState>,
): Record<string, SeatState> {
  const out: Record<string, SeatState> = {}
  for (const [key, st] of Object.entries(raw)) {
    const allocation = st.allocation ?? 'all_day'
    const storageKey = key.includes('::') ? key : stateStorageKey(st.seat_id, allocation)
    out[storageKey] = { ...st, allocation }
  }
  return out
}

export function loadDemoStates(): Record<string, SeatState> {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY)
    if (raw) return normalizeDemoStates(JSON.parse(raw) as Record<string, SeatState>)
  } catch {
    /* ignore */
  }
  return {}
}

export function saveDemoState(state: SeatState) {
  const all = loadDemoStates()
  const key = stateStorageKey(state.seat_id, state.allocation)
  all[key] = state
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(all))
  window.dispatchEvent(new CustomEvent('seat-map-demo-update', { detail: state }))
}

export function clearDemoState(seatId: string, allocation: AllocationContext) {
  const all = loadDemoStates()
  const key = stateStorageKey(seatId, allocation)
  if (!(key in all)) return
  delete all[key]
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(all))
  window.dispatchEvent(
    new CustomEvent('seat-map-demo-clear', {
      detail: { seatId, allocation },
    }),
  )
}
