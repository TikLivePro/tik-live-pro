'use client';

import { useEffect } from 'react';

interface Props {
  id: string;
  emoji: string;
  left: number;
  onDone: (id: string) => void;
}

export function LiveReactionFloat({ id, emoji, left, onDone }: Props): React.ReactElement {
  useEffect(() => {
    const timer = setTimeout(() => onDone(id), 2700);
    return () => clearTimeout(timer);
  }, [id, onDone]);

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 animate-float-reaction select-none text-2xl"
      style={{ left: `${left}px` }}
    >
      {emoji}
    </span>
  );
}
