'use client';

import { useTransition } from 'react';

export function EditableSelect({
  value,
  options,
  onSave,
}: {
  value: string | null;
  options: string[];
  onSave: (next: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={value ?? options[0]}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          await onSave(next);
        });
      }}
      className="min-w-[140px]"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
