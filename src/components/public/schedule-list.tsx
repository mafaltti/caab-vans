type ScheduleEntry = {
  id: string;
  stopName: string;
  time: string;
};

type ScheduleListProps = {
  schedule: ScheduleEntry[];
  nextStopId: string | null;
};

export function ScheduleList({ schedule, nextStopId }: ScheduleListProps) {
  if (schedule.length === 0) {
    return (
      <div className="rounded-lg bg-zinc-100 p-4">
        <p className="text-sm text-zinc-500">Nenhum horário disponível</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h3 className="mb-2 text-sm font-medium text-zinc-500">Horários</h3>
      <ul className="divide-y divide-zinc-100">
        {schedule.map((entry) => {
          const isNext = entry.id === nextStopId;
          return (
            <li
              key={entry.id}
              className={`flex items-center justify-between px-3 py-3 ${
                isNext
                  ? "rounded-lg bg-blue-50 font-semibold text-blue-700"
                  : "text-zinc-700"
              }`}
            >
              <span className="text-sm">{entry.stopName}</span>
              <span className="text-sm tabular-nums">{entry.time}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
