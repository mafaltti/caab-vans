# Status Mapping Verification — Badge & Hero Card Consistency

Verified mapping — badge and hero card now agree on every case:

| # | State | Badge | Hero Card |
|---|---|---|---|
| 1 | No route_run, before schedule | Fora de operação (zinc) | Fora de operação (zinc) |
| 2 | No route_run, in schedule, no GPS | Aguardando início (amber) | Aguardando início da rota (amber) |
| 3 | No route_run, past schedule | Fora de operação (zinc) | Programação encerrada (zinc) |
| 4 | No route_run, in schedule, GPS fresh | Aguardando início (amber) | Blue card (next stop) |
| 6 | Waiting, in schedule | Aguardando início (amber) | Aguardando início da rota (amber) |
| 7 | Waiting, past schedule (Van 4) | Fora de operação (zinc) | Programação encerrada (zinc) |
| 9 | Active shift, GPS stale | Em operação (green) | Em operação + “Localização desatualizada” |
| 10 | Active shift, GPS fresh (ideal) | Em operação (green) | Blue card (next stop + ETA) |
| 12 | Idle, no GPS (Van 1 now) | Aguardando início (amber) | Aguardando início da rota (amber) |
| 13 | Idle, GPS fresh (Van 1 earlier) | Em operação (green) | Blue card (next stop + ETA) |
| 15 | Completed, past schedule | Encerrada (emerald) | Rota encerrada por hoje (emerald) |

Cases **#2**, **#9**, and **#12** were the broken ones — all three are now consistent.
