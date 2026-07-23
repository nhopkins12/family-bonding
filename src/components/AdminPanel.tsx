import { useState, type FormEvent } from 'react'
import { useAppData } from '../state/AppDataContext'

interface AdminPanelProps {
  onClose: () => void
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          Close
        </button>

        <div className="modal-header">
          <h2>Admin Controls</h2>
        </div>

        <section className="modal-section">
          <h3>Add a Member</h3>
          <AddMemberForm />
        </section>

        <section className="modal-section">
          <h3>Add a Movie</h3>
          <AddMovieForm />
        </section>
      </div>
    </div>
  )
}

function AddMemberForm() {
  const { createMember } = useAppData()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = useState('')
  const [lastCreated, setLastCreated] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || password.length < 6) return
    setStatus('saving')
    setError('')
    try {
      await createMember({ name: name.trim(), password, isAdmin })
      setLastCreated(name.trim())
      setName('')
      setPassword('')
      setIsAdmin(false)
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <>
      <form className="admin-form" onSubmit={handleSubmit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            minLength={6}
            required
          />
        </label>
        <label className="admin-form-checkbox">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          Give admin access
        </label>
        <button type="submit" className="admin-form-submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Adding…' : 'Add member'}
        </button>
      </form>
      {status === 'error' && <p className="admin-form-error">{error}</p>}
      {lastCreated && status === 'idle' && (
        <p className="admin-form-success">
          {lastCreated} was added. Tell them their password directly — no email was sent. They can sign in and set their own
          display name.
        </p>
      )}
    </>
  )
}

function AddMovieForm() {
  const { createMovie } = useAppData()
  const [title, setTitle] = useState('')
  const [year, setYear] = useState('')
  const [actor, setActor] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving'>('idle')
  const [lastAdded, setLastAdded] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !year.trim()) return
    setStatus('saving')
    await createMovie({ title: title.trim(), year: Number(year), actor: actor.trim(), posterUrl: posterUrl.trim() })
    setLastAdded(title.trim())
    setTitle('')
    setYear('')
    setActor('')
    setPosterUrl('')
    setStatus('idle')
  }

  return (
    <>
      <form className="admin-form" onSubmit={handleSubmit}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Year
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} required />
        </label>
        <label>
          Bond actor
          <input value={actor} onChange={(e) => setActor(e.target.value)} />
        </label>
        <label>
          Poster URL
          <input value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} placeholder="Optional" />
        </label>
        <button type="submit" className="admin-form-submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Adding…' : 'Add movie'}
        </button>
      </form>
      {lastAdded && status === 'idle' && <p className="admin-form-success">{lastAdded} was added to the ranking.</p>}
    </>
  )
}
