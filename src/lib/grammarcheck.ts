import { unified } from 'unified'
import retextEnglish from 'retext-english'
import retextIndefiniteArticle from 'retext-indefinite-article'
import retextRepeatedWords from 'retext-repeated-words'
import retextSentenceSpacing from 'retext-sentence-spacing'
import { VFile } from 'vfile'

/**
 * Real subject-verb-agreement/tense-style grammar checking needs actual NLP (part-of-
 * speech tagging, sentence structure) — nothing free runs that fully client-side, and
 * the realistic alternatives (a hosted grammar API, an LLM call) mean sending review
 * text off-device, which is a separate call to make, not a default to sneak in. These
 * three retext rules cover the well-defined slice of "grammar" that a local, offline,
 * rule-based checker can actually get right without false-positiving constantly:
 * repeated words ("the the"), a/an mismatches, and doubled sentence spacing.
 */
const processor = unified().use(retextEnglish).use(retextRepeatedWords).use(retextIndefiniteArticle).use(retextSentenceSpacing)

export interface GrammarIssue {
  message: string
  start: number
  end: number
  /** The exact replacement text for the flagged range — all three rules above report
   * this directly (`message.expected`), so there's no need for per-rule fix logic. */
  fix: string | null
}

export async function findGrammarIssues(text: string): Promise<GrammarIssue[]> {
  const file = new VFile(text)
  const tree = processor.parse(file)
  await processor.run(tree, file)
  const issues: GrammarIssue[] = []
  for (const m of file.messages) {
    const start = m.place && 'start' in m.place ? m.place.start.offset : undefined
    const end = m.place && 'end' in m.place ? m.place.end.offset : undefined
    if (start === undefined || end === undefined) continue
    issues.push({ message: m.message, start, end, fix: m.expected?.[0] ?? null })
  }
  return issues
}
