import { SUBRATING_LABELS, type SubratingKey } from '../types'

interface SubratingSliderProps {
  subratingKey: SubratingKey
  value: number | undefined
  onChange: (value: number | undefined) => void
  disabled?: boolean
}

export function SubratingSlider({ subratingKey, value, onChange, disabled }: SubratingSliderProps) {
  const displayValue = value ?? 0
  const isSet = value !== undefined

  return (
    <div className="subrating-row">
      <span className="subrating-row-label">
        <span className="subrating-row-label-text">{SUBRATING_LABELS[subratingKey]}</span>
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
      <button
        type="button"
        className="subrating-row-clear"
        onClick={() => onChange(undefined)}
        disabled={disabled || !isSet}
        aria-label={`Clear ${SUBRATING_LABELS[subratingKey]} rating`}
        title="Clear rating"
      />
    </div>
  )
}
