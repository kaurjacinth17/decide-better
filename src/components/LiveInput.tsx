'use client';
/**
 * Inputs that push every keystroke to the store (live results) and commit one undo step
 * on blur / Enter — the prototype's input/change behaviour. While focused, the field shows
 * exactly what the user typed, even if it isn't a valid number yet.
 */
import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes, type KeyboardEvent } from 'react';

interface Common {
  value: string;
  onLive: (v: string) => void;
  onCommit: () => void;
}

const blurOnEnter = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.currentTarget.blur();
  }
};

export function LiveInput({
  value,
  onLive,
  onCommit,
  ...rest
}: Common & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...rest}
      value={draft ?? value}
      onFocus={(e) => {
        setDraft(value);
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onLive(e.target.value);
      }}
      onBlur={() => {
        setDraft(null);
        onCommit();
      }}
      onKeyDown={(e) => {
        if (rest.type !== 'number' || e.key === 'Enter') blurOnEnter(e);
        rest.onKeyDown?.(e);
      }}
    />
  );
}

export function LiveTextarea({
  value,
  onLive,
  onCommit,
  ...rest
}: Common & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <textarea
      {...rest}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(e) => {
        const v = e.target.value.replace(/\s*\n\s*/g, ' ');
        setDraft(v);
        onLive(v);
      }}
      onBlur={() => {
        setDraft(null);
        onCommit();
      }}
      onKeyDown={blurOnEnter}
    />
  );
}
