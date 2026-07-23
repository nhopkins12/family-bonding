import { useState } from 'react'
import { useAppData } from '../state/AppDataContext'

export function AccountBar({ onSignOut }: { onSignOut: () => void }) {
  const { myDisplayName, renameMe } = useAppData()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(myDisplayName)

  function submit() {
    if (draft.trim()) renameMe(draft)
    setIsEditing(false)
  }

  return (
    <div className="account-bar">
      {isEditing ? (
        <form
          className="account-name-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={submit} />
        </form>
      ) : (
        <button
          type="button"
          className="account-name"
          onClick={() => {
            setDraft(myDisplayName)
            setIsEditing(true)
          }}
        >
          {myDisplayName}
        </button>
      )}
      <button type="button" className="sign-out-button" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  )
}
