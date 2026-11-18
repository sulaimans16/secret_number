import { useEffect, useState, type ReactNode } from 'react';

export function Typewriter({ text, speed = 38, className }: { text: string; speed?: number; className?: string }) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) return setN(text.length);
    setN(0);
    const t = window.setInterval(() => setN((x) => (x >= text.length ? x : x + 1)), speed);
    return () => window.clearInterval(t);
  }, [text, speed, reduce]);
  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{text.slice(0, n)}</span>
      <span className="caret" aria-hidden>
        ▍
      </span>
    </span>
  );
}

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`screen ${className}`}>{children}</main>;
}

export function Brand({ small }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'brand--small' : ''}`}>
      <span className="brand__eye" aria-hidden>
        <svg viewBox="0 0 48 48" width="100%" height="100%">
          <polygon points="24,3 45,43 3,43" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="24" cy="30" r="6" fill="currentColor" />
          <circle cx="24" cy="30" r="2.2" fill="var(--bg)" />
        </svg>
      </span>
      <span className="brand__word">
        SECRET <em>NUMBER</em>
      </span>
    </div>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error}
    </p>
  );
}

export function Modal({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <div className="modal__panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal__x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

export function Avatar({ name, seat }: { name: string; seat: number }) {
  return (
    <span className="avatar" data-seat={seat % 6}>
      <span className="avatar__seat">{String(seat).padStart(2, '0')}</span>
      <span className="avatar__init">{name.slice(0, 1).toUpperCase()}</span>
    </span>
  );
}
