export const SEAT_CATEGORY_SORT = [
  'スペシャルシート',
  'コートエンド',
  'コートサイドA',
  'コートサイドB',
  '1階指定席',
  '1階指定席（ゴール裏）',
  '1階自由席',
  '2階自由席',
  'チーム券席',
]

export function seatCategoryLabel(category: string | null | undefined): string {
  const c = category?.trim()
  if (c) return c
  return '（券種未設定）'
}

export function groupBySeatCategory(
  items: { category?: string | null }[],
): { category: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = seatCategoryLabel(item.category)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => {
      const ia = SEAT_CATEGORY_SORT.indexOf(a)
      const ib = SEAT_CATEGORY_SORT.indexOf(b)
      if (ia >= 0 && ib >= 0) return ia - ib
      if (ia >= 0) return -1
      if (ib >= 0) return 1
      return a.localeCompare(b, 'ja')
    })
    .map(([category, count]) => ({ category, count }))
}
