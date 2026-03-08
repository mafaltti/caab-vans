# All Possible UI States

| # | Condition | Listing Badge | Listing Subtitle | Detail Banner |
|---|---|---|---|---|
| 1 | `runStatus = "in_progress"` (active shift, GPS fresh) | Em operação (green, pulsing) | Parada X de Y | Próxima parada: [name] [time] (blue card) |
| 2 | `runStatus = "in_progress"`, GPS stale | Em operação (green, pulsing) | Parada X de Y | Em operação + "Localização desatualizada" (blue card, amber warning) |
| 3 | `runStatus = "idle"`, `isRunning = true` | Em operação (green, pulsing) | Parada X de Y | Próxima parada: [name] [time] (blue card) |
| 4 | `runStatus = "waiting"/"idle"`, `scheduleStatus = "ended"` | Fora de operação (gray) | Programação encerrada | Programação encerrada por hoje (gray) |
| 5 | `runStatus = "waiting"/"idle"`, schedule not ended | Aguardando início (amber) | X paradas | Aguardando início da rota (amber) |
| 6 | `runStatus = "completed"` | Encerrada (light green) | Programação encerrada | Rota encerrada por hoje (green) |
| 7 | No `route_run`, `scheduleStatus = "active"` | Aguardando início (amber) | X paradas | Aguardando início da rota (amber) |
| 8 | No `route_run`, `scheduleStatus = "ended"` | Fora de operação (gray) | Programação encerrada | Programação encerrada por hoje (gray) |
| 9 | No `route_run`, `scheduleStatus = "not_started"` | Fora de operação (gray) | X paradas | Fora de operação (gray) |
| 10 | `isRunning = true`, no next stop | Em operação (green, pulsing) | — | Nenhum horário disponível (gray) |

## Notes

- Rows 4 & 8 produce the same visible output (what Rotas 02-04 showed)
- Row 6 is what Rota 01 showed (driver explicitly ended the shift)
- "Listing subtitle" also shows Parada X de Y when `currentStopIndex` is available (active routes)
