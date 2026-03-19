"use client";

import { useEffect, useState } from "react";

type ShiftTimerProps = {
  shiftStartedAt: string;
};

function formatElapsed(shiftStartedAt: string): string {
  const elapsed = Math.floor((Date.now() - new Date(shiftStartedAt).getTime()) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}min em turno`;
  return `${minutes} min em turno`;
}

export function ShiftTimer({ shiftStartedAt }: ShiftTimerProps) {
  const [display, setDisplay] = useState(() => formatElapsed(shiftStartedAt));

  useEffect(() => {
    const id = setInterval(() => {
      setDisplay(formatElapsed(shiftStartedAt));
    }, 1000);

    return () => clearInterval(id);
  }, [shiftStartedAt]);

  return <span className="text-xs text-zinc-500">{display}</span>;
}
