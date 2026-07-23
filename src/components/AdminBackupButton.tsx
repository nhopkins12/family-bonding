import { useAppData } from '../state/AppDataContext'

export function AdminBackupButton() {
  const { isAdmin, movies, allRankings, allReviews, profilesByOwner } = useAppData()

  if (!isAdmin) return null

  function handleExport() {
    const backup = {
      exportedAt: new Date().toISOString(),
      movies,
      profiles: [...profilesByOwner.values()],
      rankings: allRankings,
      reviews: allReviews,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `family-bonding-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button type="button" className="admin-backup-button" onClick={handleExport}>
      Export backup
    </button>
  )
}
