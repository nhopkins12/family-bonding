interface SortControlProps<K extends string> {
  value: K
  onChange: (key: K) => void
  options: readonly { key: K; label: string }[]
}

export function SortControl<K extends string>({ value, onChange, options }: SortControlProps<K>) {
  return (
    <div className="sort-control">
      <label>
        <span>Sort by</span>
        <select value={value} onChange={(e) => onChange(e.target.value as K)}>
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
