import { SORT_OPTIONS, type SortKey } from '../types'

interface SortControlProps {
  value: SortKey
  onChange: (key: SortKey) => void
  options?: readonly { key: SortKey; label: string }[]
}

export function SortControl({ value, onChange, options = SORT_OPTIONS }: SortControlProps) {
  return (
    <div className="sort-control">
      <label>
        <span>Sort by</span>
        <select value={value} onChange={(e) => onChange(e.target.value as SortKey)}>
          {options.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
