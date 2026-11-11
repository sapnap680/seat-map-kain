import {
  deleteField,
  doc,
  FieldPath,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { parseStateStorageKey } from './allocation'
import { db } from './firebase'
import type { SeatState, SeatStatus, SeatZone } from '../types'

/**
 * 日付ごとに1ドキュメント。中身は売れた席だけ。
 * キーは `席ID::all_day` / `席ID::men` / `席ID::women`。
 * 12/12・12/13 のコートサイド・コートエンド・スペシャルは男女別。
 * 1階指定席は終日（all_day）ひとつ。
 */
const COLLECTION = 'seatStatus'

export type SoldEntry = {
  status: Extract<SeatStatus, 'presold' | 'daysold' | 'hold'>
  at: string
  note: string | null
  label: string
  category: string | null
  zone: SeatZone
}

type SoldWrite = Omit<SoldEntry, 'at'>

type RawSold = Record<string, Record<string, unknown>>

const cache = new Map<string, Record<string, SoldEntry>>()
const listeners = new Map<string, Set<(sold: Record<string, SoldEntry>) => void>>()
const errorHandlers = new Map<string, Set<(error: Error) => void>>()
const unsubs = new Map<string, Unsubscribe>()

function statusDoc(slug: string) {
  if (!db) throw new Error('Firestore が未設定です')
  return doc(db, COLLECTION, slug)
}

function atToIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (typeof value === 'string' && value) return value
  return new Date().toISOString()
}

function parseSold(raw: unknown): Record<string, SoldEntry> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, SoldEntry> = {}
  for (const [key, value] of Object.entries(raw as RawSold)) {
    if (!value || typeof value !== 'object') continue
    const status = value.status
    if (status !== 'presold' && status !== 'daysold' && status !== 'hold') continue
    const zone = value.zone
    out[key] = {
      status,
      at: atToIso(value.at),
      note: typeof value.note === 'string' ? value.note : null,
      label: typeof value.label === 'string' ? value.label : '',
      category: typeof value.category === 'string' ? value.category : null,
      zone:
        zone === 'floor1' ||
        zone === 'floor2' ||
        zone === 'team_ticket' ||
        zone === 'courtside' ||
        zone === 'end' ||
        zone === 'special'
          ? zone
          : 'floor1',
    }
  }
  return out
}

function publish(slug: string, sold: Record<string, SoldEntry>) {
  cache.set(slug, sold)
  for (const listener of listeners.get(slug) ?? []) listener(sold)
}

export function getCachedSold(slug: string): Record<string, SoldEntry> {
  return cache.get(slug) ?? {}
}

/** 同じ日付を複数箇所から購読してもリスナーは1本 */
export function subscribeSeatStatus(
  slug: string,
  onSold: (sold: Record<string, SoldEntry>) => void,
  onError?: (error: Error) => void,
): () => void {
  let set = listeners.get(slug)
  if (!set) {
    set = new Set()
    listeners.set(slug, set)
    const unsub = onSnapshot(
      statusDoc(slug),
      (snap) => publish(slug, parseSold(snap.data()?.sold)),
      (error) => {
        console.error(error)
        for (const handler of errorHandlers.get(slug) ?? []) handler(error)
      },
    )
    unsubs.set(slug, unsub)
  }
  set.add(onSold)
  if (onError) {
    const errors = errorHandlers.get(slug) ?? new Set()
    errors.add(onError)
    errorHandlers.set(slug, errors)
  }
  const cached = cache.get(slug)
  if (cached) onSold(cached)

  return () => {
    set?.delete(onSold)
    if (onError) errorHandlers.get(slug)?.delete(onError)
    if (set && set.size === 0) {
      unsubs.get(slug)?.()
      unsubs.delete(slug)
      listeners.delete(slug)
      errorHandlers.delete(slug)
    }
  }
}

export function soldToSeatStates(
  sold: Record<string, SoldEntry>,
): Record<string, SeatState> {
  const map: Record<string, SeatState> = {}
  for (const [key, entry] of Object.entries(sold)) {
    const parsed = parseStateStorageKey(key)
    map[key] = {
      seat_id: parsed.seatId,
      allocation: parsed.allocation,
      status: entry.status,
      note: entry.note,
      updated_at: entry.at,
    }
  }
  return map
}

function assertKey(key: string) {
  if (key.includes('.')) {
    throw new Error('席キーにピリオドは使えません')
  }
}

export async function writeSoldEntry(
  slug: string,
  key: string,
  entry: SoldWrite,
): Promise<void> {
  assertKey(key)
  if (!db) throw new Error('Firestore が未設定です')
  const ref = statusDoc(slug)
  const stored = {
    status: entry.status,
    at: serverTimestamp(),
    note: entry.note,
    label: entry.label,
    category: entry.category,
    zone: entry.zone,
  }
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) {
      tx.set(ref, { sold: { [key]: stored } })
      return
    }
    tx.update(ref, new FieldPath('sold', key), stored)
  })
}

export async function clearSoldEntry(slug: string, key: string): Promise<void> {
  assertKey(key)
  if (!db) throw new Error('Firestore が未設定です')
  const ref = statusDoc(slug)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    tx.update(ref, new FieldPath('sold', key), deleteField())
  })
}
