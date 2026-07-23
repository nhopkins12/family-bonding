import { SORT_OPTIONS, type SortKey } from '../types'

interface SortControlProps {
  value: SortKey
  onChange: (key: SortKey) => void
}

export function SortControl({ value, onChange }: SortControlProps) {
  return (
    <div className="sort-control">
      <label>
        <span>Sort by</span>
        <select value={value} onChange={(e) => onChange(e.target.value as SortKey)}>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
