export type RankingView = 'grid' | 'list'

const STORAGE_KEY = 'family-bonding:ranking-view'

export function getStoredView(): RankingView {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'list' ? 'list' : 'grid'
}

export function storeView(view: RankingView): void {
  localStorage.setItem(STORAGE_KEY, view)
}
