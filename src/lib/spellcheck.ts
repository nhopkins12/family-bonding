import nspell from 'nspell'
import { BOND_DICTIONARY } from './bondDictionary'

// dictionary-en's package.json only declares `"exports": "./index.js"`, which blocks
// importing its .aff/.dic subpaths directly in a bundler build (it's built for Node,
// reading them off disk at runtime). scripts/copy-dictionary.js copies both into
// public/dictionaries/ on every install instead, so they're fetched here as plain
// static assets — also lets the ~550KB dictionary load lazily on demand rather than
// being inlined into the main JS bundle before anyone's even opened a review to write.
const AFF_URL = '/dictionaries/en.aff'
const DIC_URL = '/dictionaries/en.dic'

export type Speller = ReturnType<typeof nspell>

let spellerPromise: Promise<Speller> | null = null

/** Loads once and caches the result — every caller after the first gets the same instance. */
export function loadSpeller(): Promise<Speller> {
  spellerPromise ??= Promise.all([fetch(AFF_URL).then((r) => r.text()), fetch(DIC_URL).then((r) => r.text())]).then(([aff, dic]) => {
    const speller = nspell(aff, dic)
    // Character/villain/actor names that come up constantly in Bond reviews but aren't
    // in a general English dictionary — without these, half of what gets underlined in
    // a typical review would be "Blofeld" and "Skyfall", not real mistakes.
    for (const word of BOND_DICTIONARY) speller.add(word)
    return speller
  })
  return spellerPromise
}

// Letters and internal apostrophes only, so "don't" stays one word but surrounding
// punctuation/quotes don't get pulled in and falsely flagged.
const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)*/g

export interface MisspelledWord {
  word: string
  start: number
  end: number
}

export function findMisspelled(speller: Speller, text: string): MisspelledWord[] {
  const results: MisspelledWord[] = []
  WORD_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WORD_RE.exec(text))) {
    const word = match[0]
    if (word.length < 2) continue
    // Try the word as typed first (dictionaries carry proper-noun entries under their
    // natural capitalization), then lowercase — catches ordinary words that only appear
    // lowercase in the dictionary but were typed capitalized at the start of a sentence.
    if (speller.correct(word) || speller.correct(word.toLowerCase())) continue
    results.push({ word, start: match.index, end: match.index + word.length })
  }
  return results
}
