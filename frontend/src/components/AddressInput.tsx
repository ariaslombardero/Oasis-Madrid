import { useEffect, useRef, useState } from 'react';
import { api, type GeocodeSuggestion } from '../services/api';

interface Props {
  placeholder: string;
  ariaLabel: string;
  value: string;
  onChange: (text: string) => void;
  onSelect: (s: GeocodeSuggestion) => void;
  children: React.ReactNode; // icon passed from parent
}

const DEBOUNCE_MS = 320;
const MIN_CHARS = 2;

export function AddressInput({ placeholder, ariaLabel, value, onChange, onSelect, children }: Props) {
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string>('');

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.length < MIN_CHARS || value === selectedRef.current) { 
      setSuggestions([]); 
      setOpen(false); 
      return; 
    }

    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.geocode(value);
        setSuggestions(res.results ?? []);
        setOpen((res.results ?? []).length > 0);
        setActiveIdx(-1);
      } catch { setSuggestions([]); setOpen(false); }
    }, DEBOUNCE_MS);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  const pick = (s: GeocodeSuggestion) => {
    selectedRef.current = s.label;
    onChange(s.label);
    onSelect(s);
    setSuggestions([]);
    setOpen(false);
    // Blur the input so mobile keyboard closes
    const input = wrapRef.current?.querySelector('input');
    if (input) input.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); pick(suggestions[activeIdx]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={wrapRef} className="address-wrap">
      <div className="input-wrap">
        {children}
        <input
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={value}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-activedescendant={activeIdx >= 0 ? `sug-${activeIdx}` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          autoComplete="off"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="suggestions-list" role="listbox" aria-label={ariaLabel}>
          {suggestions.map((s, i) => (
            <li
              key={i}
              id={`sug-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              className={`suggestion-item ${i === activeIdx ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); pick(s); }}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
