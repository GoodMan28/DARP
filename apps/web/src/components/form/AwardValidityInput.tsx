'use client';

import { useEffect, useState } from 'react';
import { Select, Input } from '@/components/ui';
import {
  PREDEFINED_VALIDITY_OPTIONS,
  PREDEFINED_VALIDITY_MAP,
  CANONICAL_TO_PREDEFINED,
  validateAndNormalizeValidity,
  formatAwardValidity,
} from '@darp/shared/format';

interface Props {
  id: string;
  disabled?: boolean;
  value: unknown;
  onChange: (val: string) => void;
  invalid?: boolean;
  options?: string[];
}

function deriveState(val: unknown): { selectOption: string; customValue: string } {
  const str = String(val ?? '').trim();
  if (!str) return { selectOption: '', customValue: '' };

  if (str === 'Lifetime') {
    return { selectOption: 'Lifetime', customValue: '' };
  }

  if (CANONICAL_TO_PREDEFINED[str]) {
    return { selectOption: CANONICAL_TO_PREDEFINED[str], customValue: '' };
  }

  if (str in PREDEFINED_VALIDITY_MAP) {
    return { selectOption: str, customValue: '' };
  }

  // Any other stored non-empty value (e.g. '4', '0.25', '0.5', '0.75') is Custom
  return { selectOption: 'Custom', customValue: str };
}

export function AwardValidityInput({
  id,
  disabled = false,
  value,
  onChange,
  invalid = false,
  options = [...PREDEFINED_VALIDITY_OPTIONS],
}: Props) {
  const [selectOption, setSelectOption] = useState<string>(() => deriveState(value).selectOption);
  const [customValue, setCustomValue] = useState<string>(() => deriveState(value).customValue);
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    const derived = deriveState(value);
    setSelectOption(derived.selectOption);
    if (derived.selectOption === 'Custom') {
      setCustomValue(derived.customValue);
    }
  }, [value]);

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = e.target.value;
    setSelectOption(selected);
    setCustomError(null);

    if (!selected) {
      setCustomValue('');
      onChange('');
      return;
    }

    if (selected === 'Custom') {
      // If we already have a valid custom value, propagate it; otherwise propagate current customValue or empty
      if (customValue.trim()) {
        const res = validateAndNormalizeValidity(customValue);
        if (!res.valid) {
          setCustomError(res.error ?? 'Invalid custom validity.');
          onChange(customValue);
        } else {
          setCustomError(null);
          onChange(res.canonical!);
        }
      } else {
        onChange('');
      }
      return;
    }

    if (selected in PREDEFINED_VALIDITY_MAP) {
      setCustomValue('');
      onChange(PREDEFINED_VALIDITY_MAP[selected]!);
    } else {
      onChange(selected);
    }
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setCustomValue(raw);

    if (!raw.trim()) {
      setCustomError('Enter a custom validity period.');
      onChange('');
      return;
    }

    const res = validateAndNormalizeValidity(raw);
    if (!res.valid) {
      setCustomError(res.error ?? 'Invalid custom validity.');
      // Keep raw so parent form is aware of invalid input and can prevent submission
      onChange(raw);
    } else {
      setCustomError(null);
      onChange(res.canonical!);
    }
  }

  const isCustom = selectOption === 'Custom';
  const showFormattedHelp = Boolean(value) && disabled;

  return (
    <div className="space-y-2">
      <Select
        id={id}
        disabled={disabled}
        aria-invalid={invalid || Boolean(customError) || undefined}
        value={selectOption}
        onChange={handleSelectChange}
      >
        <option value="">— Select —</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>

      {isCustom ? (
        <div className="rounded-sm border border-line bg-surface-2 p-2.5">
          <label
            htmlFor={`${id}-custom`}
            className="mb-1 block text-xs font-medium text-ink"
          >
            Custom validity in years
          </label>
          <Input
            id={`${id}-custom`}
            disabled={disabled}
            inputMode="decimal"
            placeholder="e.g. 4 or 0.5"
            value={customValue}
            onChange={handleCustomChange}
            aria-invalid={Boolean(customError) || undefined}
            aria-describedby={customError ? `${id}-custom-error` : `${id}-custom-hint`}
          />
          <p id={`${id}-custom-hint`} className="mt-1 text-2xs text-ink-muted">
            Whole numbers of years (e.g. 4, 7, 15) or 0.25 (3 months), 0.5 (6 months), 0.75 (9 months).
          </p>
          {customError ? (
            <p id={`${id}-custom-error`} className="mt-1 text-xs text-danger-700" role="alert">
              {customError}
            </p>
          ) : null}
        </div>
      ) : null}

      {showFormattedHelp ? (
        <p className="text-xs text-ink-muted">
          Current validity: <strong className="font-semibold text-ink">{formatAwardValidity(value)}</strong>
        </p>
      ) : null}
    </div>
  );
}
