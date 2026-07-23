import { useAppData } from '../state/AppDataContext'

interface MembersListProps {
  onOpenMember: (ownerId: string) => void
}

export function MembersList({ onOpenMember }: MembersListProps) {
  const { profilesByOwner, allRankings } = useAppData()
  const members = [...profilesByOwner.entries()].sort((a, b) => a[1].displayName.localeCompare(b[1].displayName))

  if (members.length === 0) {
    return <p className="empty-state">No members yet.</p>
  }

  return (
    <section className="ranking-section">
      <h2>Members</h2>
      <div className="ranked-list">
        {members.map(([ownerId, profile]) => {
          const rankedCount = allRankings.find((r) => r.owner === ownerId)?.orderedMovieIds?.filter(Boolean).length ?? 0
          return (
            <button key={ownerId} type="button" className="member-card" onClick={() => onOpenMember(ownerId)}>
              <span className="member-card-name">{profile.displayName}</span>
              <span className="member-card-stat">{rankedCount === 0 ? 'No ranking yet' : `${rankedCount} ranked`}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
