export const SUBRATING_KEYS = [
  'story',
  'bond',
  'villain',
  'action',
  'themeSong',
  'rewatchability',
  'datedness',
  'misogyny',
  'culturalInsensitivity',
  'campiness',
] as const

export type SubratingKey = (typeof SUBRATING_KEYS)[number]

/** Category label shown on score rows / sliders (neutral, not sort-direction framed). */
export const SUBRATING_LABELS: Record<SubratingKey, string> = {
  story: 'Story',
  bond: 'Bond',
  villain: 'Villain',
  action: 'Action',
  themeSong: 'Theme Song',
  rewatchability: 'Rewatchability',
  datedness: 'Datedness',
  misogyny: 'Misogyny',
  culturalInsensitivity: 'Cultural Insensitivity',
  campiness: 'Campiness',
}

/** Categories where a HIGHER score means more present, not "better". */
export const INVERTED_SUBRATINGS: ReadonlySet<SubratingKey> = new Set([
  'datedness',
  'misogyny',
  'culturalInsensitivity',
  'campiness',
])

/** Sort key for ranking views: manual/consensus rank order, or one of the categories. */
export type SortKey = 'overall' | SubratingKey

/** Sort-menu labels, framed by direction ("Best X" for positive categories, "Most X" for descriptive ones). */
export const SORT_LABELS: Record<SortKey, string> = {
  overall: 'Overall',
  story: 'Best Story',
  bond: 'Best Bond',
  villain: 'Best Villain',
  action: 'Best Action',
  themeSong: 'Best Theme Song',
  rewatchability: 'Most Rewatchable',
  datedness: 'Most Dated',
  misogyny: 'Most Misogynistic',
  culturalInsensitivity: 'Most Culturally Insensitive',
  campiness: 'Most Campy',
}

export const SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: 'overall', label: SORT_LABELS.overall },
  ...SUBRATING_KEYS.map((key) => ({ key, label: SORT_LABELS[key] })),
]

export type Subratings = Partial<Record<SubratingKey, number>>

/** Draft shape used while editing a review in the UI, independent of the backend model. */
export interface ReviewDraft {
  text: string
  subratings: Subratings
}
