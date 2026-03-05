"use client";

interface RouteProgressBarProps {
  totalStops: number;
  passedCount: number;
  firstStopLabel?: string;
  lastStopLabel?: string;
}

export function RouteProgressBar({
  totalStops,
  passedCount,
  firstStopLabel,
  lastStopLabel,
}: RouteProgressBarProps) {
  const safeTotalStops = Math.max(0, totalStops);
  const safePassedCount = Math.min(Math.max(0, passedCount), safeTotalStops);

  return (
    <div>
      <div className="flex items-center gap-1">
        {Array.from({ length: safeTotalStops }, (_, i) => {
          if (i < safePassedCount) {
            return (
              <div
                key={i}
                className="h-1 flex-1 rounded-full bg-blue-600"
              />
            );
          }
          if (i === safePassedCount) {
            return (
              <div
                key={i}
                className="h-1 flex-1 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, #2563eb 60%, #e4e4e7 60%)",
                }}
              />
            );
          }
          return (
            <div
              key={i}
              className="h-1 flex-1 rounded-full bg-zinc-200"
            />
          );
        })}
      </div>
      {(firstStopLabel || lastStopLabel) && (
        <div className="mt-1.5 flex justify-between text-[0.65rem] text-zinc-400">
          <span>{firstStopLabel}</span>
          <span>{lastStopLabel}</span>
        </div>
      )}
    </div>
  );
}
