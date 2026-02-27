import type { NextStop, ScheduleStatus } from "@/types";

type NextStopDisplayProps = {
  nextStop: NextStop | null;
  scheduleStatus: ScheduleStatus;
};

export function NextStopDisplay({
  nextStop,
  scheduleStatus,
}: NextStopDisplayProps) {
  if (scheduleStatus === "ended") {
    return (
      <div className="rounded-lg bg-zinc-100 p-4">
        <p className="text-sm font-medium text-zinc-500">
          Programação encerrada por hoje
        </p>
      </div>
    );
  }

  if (!nextStop) {
    return (
      <div className="rounded-lg bg-zinc-100 p-4">
        <p className="text-sm font-medium text-zinc-500">
          Nenhum horário disponível
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-blue-50 p-4">
      <p className="text-xs font-medium text-blue-600">
        Próxima parada programada
      </p>
      <p className="mt-1 text-lg font-semibold text-zinc-900">
        {nextStop.stopName}
      </p>
      <p className="text-sm text-zinc-600">{nextStop.time}</p>
      <p className="mt-2 text-xs text-zinc-500">
        Confira o link de localização para a posição atual.
      </p>
    </div>
  );
}
