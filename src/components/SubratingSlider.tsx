import { SUBRATING_LABELS, INVERTED_SUBRATINGS, type SubratingKey } from '../types'

interface SubratingSliderProps {
  subratingKey: SubratingKey
  value: number | undefined
  onChange: (value: number) => void
  disabled?: boolean
}

export function SubratingSlider({ subratingKey, value, onChange, disabled }: SubratingSliderProps) {
  const isInverted = INVERTED_SUBRATINGS.has(subratingKey)
  const displayValue = value ?? 0

  return (
    <div className="subrating-row">
      <span className="subrating-row-label">
        <span className="subrating-row-label-text">{SUBRATING_LABELS[subratingKey]}</span>
        {isInverted && <span className="inverted-tag">more</span>}
      </span>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={displayValue}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="subrating-row-value">{value ?? '–'}</span>
    </div>
  )
}
