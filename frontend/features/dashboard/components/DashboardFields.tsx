import type { ChangeEventHandler } from 'react';

type DashboardTextFieldProps = {
  id: string;
  label: string;
  name: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  type?: 'text' | 'email' | 'tel';
  placeholder?: string;
  autoComplete?: string;
  helperText?: string;
  error?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  maxLength?: number;
};

export function DashboardTextField({
  id,
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  helperText,
  error,
  inputMode,
  maxLength,
}: DashboardTextFieldProps) {
  const describedBy = error ? `${id}-error` : helperText ? `${id}-help` : undefined;

  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-midnight">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-12 w-full min-w-0 rounded-xl border border-midnight/15 bg-white px-3.5 text-sm text-midnight outline-none transition placeholder:text-midnight/40 hover:border-midnight/25 focus:border-midnight/50 focus:ring-2 focus:ring-lime/55 motion-reduce:transition-none"
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs leading-5 text-[#a3332a]">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${id}-help`} className="text-xs leading-5 text-midnight/55">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

type DashboardSelectFieldProps = {
  id: string;
  label: string;
  name: string;
  value: string;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  options: readonly string[];
  error?: string;
};

export function DashboardSelectField({
  id,
  label,
  name,
  value,
  onChange,
  options,
  error,
}: DashboardSelectFieldProps) {
  const describedBy = error ? `${id}-error` : undefined;

  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-midnight">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-12 w-full min-w-0 rounded-xl border border-midnight/15 bg-white px-3.5 text-sm text-midnight outline-none transition hover:border-midnight/25 focus:border-midnight/50 focus:ring-2 focus:ring-lime/55 motion-reduce:transition-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-error`} className="text-xs leading-5 text-[#a3332a]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
