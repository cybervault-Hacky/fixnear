import type { ChangeEventHandler, InputHTMLAttributes } from 'react';

type TechnicianInputProps = {
  id: string;
  label: string;
  name: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  type?: 'text' | 'email' | 'tel' | 'number' | 'time';
  placeholder?: string;
  helperText?: string;
  error?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  min?: string | number;
  max?: string | number;
  step?: string | number;
  maxLength?: number;
  disabled?: boolean;
  required?: boolean;
};

export function TechnicianInput({
  id,
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  helperText,
  error,
  inputMode,
  min,
  max,
  step,
  maxLength,
  disabled = false,
  required = false,
}: TechnicianInputProps) {
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
        inputMode={inputMode}
        min={min}
        max={max}
        step={step}
        maxLength={maxLength}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-12 w-full min-w-0 rounded-xl border border-midnight/15 bg-white px-3.5 text-sm text-midnight outline-none transition placeholder:text-midnight/40 hover:border-midnight/25 focus:border-midnight/50 focus:ring-2 focus:ring-lime/55 disabled:cursor-not-allowed disabled:bg-[#f5f6f6] disabled:text-midnight/45 motion-reduce:transition-none"
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

type TechnicianTextAreaProps = {
  id: string;
  label: string;
  name: string;
  value: string;
  onChange: ChangeEventHandler<HTMLTextAreaElement>;
  placeholder?: string;
  helperText?: string;
  error?: string;
  maxLength?: number;
  rows?: number;
};

export function TechnicianTextArea({
  id,
  label,
  name,
  value,
  onChange,
  placeholder,
  helperText,
  error,
  maxLength,
  rows = 5,
}: TechnicianTextAreaProps) {
  const describedBy = error ? `${id}-error` : helperText ? `${id}-help` : undefined;

  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-midnight">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="w-full min-w-0 resize-y rounded-xl border border-midnight/15 bg-white px-3.5 py-3 text-sm leading-6 text-midnight outline-none transition placeholder:text-midnight/40 hover:border-midnight/25 focus:border-midnight/50 focus:ring-2 focus:ring-lime/55 motion-reduce:transition-none"
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
