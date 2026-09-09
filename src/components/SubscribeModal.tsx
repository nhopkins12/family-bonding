import { useState } from 'react'
import { ModalBackdrop } from './ModalBackdrop'

interface SubscribeModalProps {
  feedUrl: string
  onClose: () => void
}

/**
 * A subscription URL, not a download link — most calendar apps intercept a
 * webcal:// link and open their own "add subscription" dialog directly, which is
 * the one-click path; the copyable https:// link is the fallback for apps that
 * want it pasted in manually instead.
 */
export function SubscribeModal({ feedUrl, onClose }: SubscribeModalProps) {
  const [copied, setCopied] = useState(false)
  const webcalUrl = feedUrl.replace(/^https:\/\//, 'webcal://')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
    } catch {
      // Clipboard access can be blocked (permissions, non-HTTPS context, etc.) —
      // the link is still right there to select and copy by hand.
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          Close
        </button>

        <div className="modal-header">
          <h2>Subscribe to the calendar</h2>
        </div>

        <section className="modal-section">
          <p className="modal-meta">
            Add this as a calendar subscription in Google, Apple, or Outlook Calendar. It stays live and updates on its own —
            no re-downloading when a movie night changes.
          </p>
          <div className="sunday-action-row">
            <a className="admin-form-submit" href={webcalUrl}>
              Open in Calendar app
            </a>
            <button type="button" className="secondary-button" onClick={() => void handleCopy()}>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </section>
      </div>
    </ModalBackdrop>
  )
}
