import { BOND_MOVIES } from '../data/bondMovies'

/**
 * Recurring character, villain, and franchise names that show up constantly in reviews
 * of these films but obviously aren't in a general English dictionary — without this,
 * roughly half of what gets underlined in a typical review would be "Blofeld" and
 * "Skyfall", not real mistakes. Movie titles and actor names are pulled straight from
 * BOND_MOVIES below so this list only needs the names that data doesn't already cover.
 */
const BOND_CHARACTERS = [
  'Blofeld',
  'Moneypenny',
  'Leiter',
  'Oddjob',
  'Scaramanga',
  'Trevelyan',
  'Onatopp',
  'Vesper',
  'Chiffre',
  'Largo',
  'Solitaire',
  'Kananga',
  'Jinx',
  'Camille',
  'Severine',
  'Silva',
  'Madeleine',
  'Swann',
  'Nomi',
  'Safin',
  'Contreras',
  'Zorin',
  'May',
  'Nick',
  'Nack',
  'Jaws',
  'Renard',
  'Elektra',
  'Christmas',
  'Kincade',
  'Tanner',
  'Mathis',
  'Felix',
  'SPECTRE',
  'SMERSH',
  'Skyfall',
  'Aston',
  'Martin',
  'Walther',
  'Vodka',
  'Martini',
]

function wordsFrom(title: string): string[] {
  return title.split(/[\s'-]+/).filter((w) => /^[A-Za-z]+$/.test(w))
}

export const BOND_DICTIONARY: string[] = Array.from(
  new Set([
    ...BOND_MOVIES.flatMap((m) => wordsFrom(m.title)),
    ...BOND_MOVIES.flatMap((m) => wordsFrom(m.actor)),
    ...BOND_CHARACTERS,
  ]),
)
