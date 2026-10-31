'use client';

import { useState } from 'react';
import { Input, Select } from '@/components/ui';

const OTHER = '__other__';

/**
 * A dropdown with a way out: for people and places outside BIT, whose choices IQAC cannot list in full.
 * "Other" shows a box to type the answer; the answer is saved as plain text, like any other choice.
 */
export function SelectOrOther({ id, value, options, disabled, invalid, onChange }: {
  id: string;
  value: string;
  options: string[];
  disabled: boolean;
  invalid: boolean;
  onChange: (v: string) => void;
}) {
  // A saved value that is not one of the choices is an "other" answer: open the box with it.
  const [other, setOther] = useState(value !== '' && !options.includes(value));
  const asOther = other || (value !== '' && !options.includes(value));
  return (
    <div className="space-y-1.5">
      <Select
        id={id}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        value={asOther ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) { setOther(true); onChange(''); return; }
          setOther(false);
          onChange(e.target.value);
        }}
      >
        <option value="">— Select —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={OTHER}>Other (type it)</option>
      </Select>
      {asOther ? (
        <Input
          aria-label="Type the answer"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          value={value}
          placeholder="Type it here"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
    </div>
  );
}
