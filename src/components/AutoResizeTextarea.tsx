import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent, TextareaHTMLAttributes } from 'react'
import { debounce } from '../lib/debounce'
import { findGrammarIssues, type GrammarIssue } from '../lib/grammarcheck'
import { findMisspelled, loadSpeller, type MisspelledWord, type Speller } from '../lib/spellcheck'

// A single shape for both checks so the backdrop/click/popover code doesn't need to know
// which one it's looking at until it's time to render the fix. Grammar issues carry their
// own single fix (see grammarcheck.ts); spelling issues carry the raw word instead, so the
// popover can ask the speller for a suggestion list.
type Issue =
  | { kind: 'spelling'; start: number; end: number; word: string }
  | { kind: 'grammar'; start: number; end: number; message: string; fix: string | null }

interface ActiveIssue {
  issue: Issue
  top: number
  left: number
}

/**
 * Grows with content instead of scrolling internally or relying on the browser's manual
 * drag-corner resize handle — which has no awareness of the modal it sits in and lets you
 * drag a textarea wider/taller than its container. Caps out at a max height (see
 * .autoresize-textarea in index.css) so one extremely long review can't blow out the
 * whole modal; beyond that it scrolls like normal.
 *
 * Forwards the real <textarea> node — MyReviewModal uses it to carry the cursor position
 * across into the focused-writing overlay's own separate textarea, since a fresh DOM node
 * has no memory of where the caret was in the one it replaced.
 *
 * Spelling + a narrow slice of grammar (repeated words, a/an mismatches, doubled sentence
 * spacing) are custom-checked here, not the native browser spellcheck attribute — native
 * spellcheck's visual underline is entirely up to the browser/OS and can't be relied on to
 * show up at all. A plain <div> "backdrop" sits behind the real textarea and mirrors its
 * text exactly, wrapping flagged ranges in a squiggly-underlined <span> (red for spelling,
 * blue for grammar — same convention as Google Docs); the textarea on top has invisible
 * text (color: transparent) so only the backdrop's glyphs are actually seen, while the real
 * caret/selection/typing all still happen in the real textarea. Both elements share one CSS
 * class with every box-model property spelled out explicitly (not inherited from a tag
 * selector) so a div and a textarea end up pixel-identical. Real subject-verb-agreement/
 * tense grammar checking needs actual NLP that nothing free runs fully client-side — see
 * grammarcheck.ts for what these three rules can and can't catch.
 */
export const AutoResizeTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { autosize?: boolean }>(
  function AutoResizeTextarea({ value, className, spellCheck = true, autosize = true, onChange, onClick, ...rest }, forwardedRef) {
    const innerRef = useRef<HTMLTextAreaElement>(null)
    const backdropRef = useRef<HTMLDivElement>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement)

    const text = typeof value === 'string' ? value : ''

    // The focused writing overlay wants the opposite: a fixed panel height with the
    // wrapper flex-filling it via CSS, which an inline pixel height (set below) would
    // fight — autosize=false skips setting it and leaves sizing entirely to CSS.
    useLayoutEffect(() => {
      if (!autosize) return
      const el = innerRef.current
      const wrap = wrapRef.current
      if (!el || !wrap) return
      el.style.height = 'auto'
      wrap.style.height = `${el.scrollHeight}px`
      el.style.height = ''
    }, [text, autosize])

    const [speller, setSpeller] = useState<Speller | null>(null)
    useEffect(() => {
      if (!spellCheck) return
      let cancelled = false
      loadSpeller().then((s) => {
        if (!cancelled) setSpeller(s)
      })
      return () => {
        cancelled = true
      }
    }, [spellCheck])

    const [misspelled, setMisspelled] = useState<MisspelledWord[]>([])
    const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>([])
    const [activeIssue, setActiveIssue] = useState<ActiveIssue | null>(null)

    const recomputeSpelling = useMemo(
      () =>
        debounce((nextText: string, currentSpeller: Speller) => {
          setMisspelled(findMisspelled(currentSpeller, nextText))
        }, 250),
      [],
    )
    useEffect(() => () => recomputeSpelling.cancel(), [recomputeSpelling])
    useEffect(() => {
      if (!speller) return
      recomputeSpelling(text, speller)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text, speller])

    // findGrammarIssues is async — a request counter drops any resolution that isn't for
    // the latest text, so a slow lookup for stale text can't clobber a newer, faster one.
    const grammarRequestId = useRef(0)
    const recomputeGrammar = useMemo(
      () =>
        debounce((nextText: string) => {
          const id = ++grammarRequestId.current
          findGrammarIssues(nextText).then((issues) => {
            if (grammarRequestId.current === id) setGrammarIssues(issues)
          })
        }, 250),
      [],
    )
    useEffect(() => () => recomputeGrammar.cancel(), [recomputeGrammar])
    useEffect(() => {
      if (!spellCheck) return
      recomputeGrammar(text)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text, spellCheck])

    // A correction can invalidate the popover's own range (offsets shift), so any edit at
    // all just closes it rather than risk it pointing at stale text.
    useEffect(() => {
      setActiveIssue(null)
    }, [text])

    useEffect(() => {
      if (!activeIssue) return
      function onPointerDown(e: globalThis.MouseEvent) {
        if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setActiveIssue(null)
      }
      function onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') setActiveIssue(null)
      }
      document.addEventListener('mousedown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
      return () => {
        document.removeEventListener('mousedown', onPointerDown)
        document.removeEventListener('keydown', onKeyDown)
      }
    }, [activeIssue])

    // Merged, non-overlapping, sorted by position — grammar issues (phrase-level: repeated
    // words, article/spacing) win any overlap since they're the more specific signal in
    // the rare case a spelling match sits inside one (e.g. a misspelled word right next to
    // a doubled-space flag).
    const issues = useMemo(() => mergeIssues(misspelled, grammarIssues), [misspelled, grammarIssues])

    function handleClick(e: MouseEvent<HTMLTextAreaElement>) {
      onClick?.(e)
      const el = e.currentTarget
      const pos = el.selectionStart
      const index = issues.findIndex((i) => pos >= i.start && pos <= i.end)
      if (index === -1) {
        setActiveIssue(null)
        return
      }
      const span = backdropRef.current?.querySelector(`[data-issue-index="${index}"]`)
      const wrap = wrapRef.current
      if (!span || !wrap) return
      const spanRect = span.getBoundingClientRect()
      const wrapRect = wrap.getBoundingClientRect()
      setActiveIssue({
        issue: issues[index],
        top: spanRect.bottom - wrapRect.top,
        left: spanRect.left - wrapRect.left,
      })
    }

    function applyFix(replacement: string) {
      const el = innerRef.current
      if (!el || !activeIssue) return
      const { start, end } = activeIssue.issue
      const nextValue = text.slice(0, start) + replacement + text.slice(end)
      // Dispatching a real 'input' event after setting value through the native setter is
      // the standard way to "type into" a React-controlled input programmatically — React
      // listens for the real DOM event, so the existing onChange prop fires exactly as if
      // the user had typed it, with no need to fabricate a synthetic React event by hand.
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
      nativeSetter?.call(el, nextValue)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      const nextCursor = start + replacement.length
      requestAnimationFrame(() => {
        el.focus()
        el.selectionStart = el.selectionEnd = nextCursor
      })
      setActiveIssue(null)
    }

    const wrapperClassName = ['autoresize-textarea-wrap', className].filter(Boolean).join(' ')
    const surfaceClassName = 'autoresize-textarea'

    return (
      <div ref={wrapRef} className={wrapperClassName}>
        <div ref={backdropRef} className={`${surfaceClassName} autoresize-textarea-backdrop`} aria-hidden="true">
          {renderBackdrop(text, issues)}
        </div>
        <textarea
          ref={innerRef}
          value={value}
          rows={1}
          spellCheck={false}
          lang="en"
          className={`${surfaceClassName} autoresize-textarea-input`}
          onChange={onChange}
          onClick={handleClick}
          {...rest}
        />
        {activeIssue && <IssuePopover active={activeIssue} speller={speller} onPick={applyFix} onIgnore={() => setActiveIssue(null)} />}
      </div>
    )
  },
)

function mergeIssues(misspelled: MisspelledWord[], grammarIssues: GrammarIssue[]): Issue[] {
  const grammar: Issue[] = grammarIssues.map((g) => ({ kind: 'grammar', start: g.start, end: g.end, message: g.message, fix: g.fix }))
  const spelling: Issue[] = misspelled
    .filter((m) => !grammar.some((g) => m.start < g.end && m.end > g.start))
    .map((m) => ({ kind: 'spelling', start: m.start, end: m.end, word: m.word }))
  return [...grammar, ...spelling].sort((a, b) => a.start - b.start)
}

// A trailing newline needs a trailing zero-width space to keep the last empty line's
// height — a <div> collapses a trailing \n with nothing after it, a <textarea> never does.
// Written as an escape, not a literal character, so it isn't flagged as stray invisible
// whitespace in the source file.
const TRAILING_NEWLINE_PAD = '​'

function renderBackdrop(text: string, issues: Issue[]) {
  if (issues.length === 0) {
    return text.endsWith('\n') ? `${text}${TRAILING_NEWLINE_PAD}` : text || TRAILING_NEWLINE_PAD
  }
  const parts: (string | JSX.Element)[] = []
  let cursor = 0
  issues.forEach((issue, i) => {
    if (issue.start > cursor) parts.push(text.slice(cursor, issue.start))
    parts.push(
      <span key={i} data-issue-index={i} className={`spellcheck-issue spellcheck-issue-${issue.kind}`}>
        {text.slice(issue.start, issue.end)}
      </span>,
    )
    cursor = issue.end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  else if (text.endsWith('\n')) parts.push(TRAILING_NEWLINE_PAD)
  return parts
}

function IssuePopover({
  active,
  speller,
  onPick,
  onIgnore,
}: {
  active: ActiveIssue
  speller: Speller | null
  onPick: (replacement: string) => void
  onIgnore: () => void
}) {
  const { issue } = active
  const spellingSuggestions = useMemo(
    () => (issue.kind === 'spelling' && speller ? speller.suggest(issue.word) : []),
    [issue, speller],
  )
  const options = issue.kind === 'grammar' ? (issue.fix !== null ? [issue.fix] : []) : spellingSuggestions.slice(0, 5)

  return (
    <div className="spellcheck-popover" style={{ top: active.top, left: active.left }} onMouseDown={(e) => e.stopPropagation()}>
      {issue.kind === 'grammar' && <p className="spellcheck-popover-message">{issue.message}</p>}
      {options.length === 0 ? (
        <p className="spellcheck-popover-empty">No suggestions</p>
      ) : (
        options.map((s) => (
          <button key={s} type="button" className="spellcheck-popover-item" onClick={() => onPick(s)}>
            {s}
          </button>
        ))
      )}
      <button type="button" className="spellcheck-popover-item spellcheck-popover-ignore" onClick={onIgnore}>
        Ignore
      </button>
    </div>
  )
}
