# Benchmark Docker workflow

Ten katalog jest miejscem na generatory obciazenia, scenariusze i wyniki. Infrastruktura Dockera znajduje sie w `docker-compose.benchmark.yml`.

Frontend nie jest potrzebny do benchmarkow. Aplikacje React sa demonstracja dzialania, natomiast pomiar komunikacji real-time powinien byc wykonywany przez syntetycznych klientow w `benchmark-runner`. Dzieki temu mierzysz transport, backend i siec, a nie renderowanie UI, React state updates ani wydajnosc przegladarki.

## Start bazy

```bash
docker compose -f docker-compose.benchmark.yml up -d postgres redis
```

## Start pojedynczego serwera

Przyklad dla Kanban WebSocket:

```bash
docker compose -f docker-compose.benchmark.yml --profile kanban-ws up -d --build websocket-kanban-server
```

Przyklad dla Kanban SSE:

```bash
docker compose -f docker-compose.benchmark.yml --profile kanban-sse up -d --build sse-kanban-server
```

## Start runnera

```bash
docker compose -f docker-compose.benchmark.yml --profile runner up -d --build benchmark-runner
```

Do srodka kontenera:

```bash
docker compose -f docker-compose.benchmark.yml exec benchmark-runner bash
```

## Kanban benchmark

Scenariusz Kanban przygotowuje deterministyczne dane testowe:

- projekt `BENCH`,
- `CLIENTS` uzytkownikow `bench_user_0001...`,
- `SEED_TASKS` zadan rozlozonych po kolumnach,
- haslo wszystkich uzytkownikow: `password123`.

Wlasciwy pomiar dziala bez frontendu. Jeden proces runnera tworzy wielu klientow, loguje ich, subskrybuje projekt i wykonuje operacje:

- `create`,
- `move`,
- `update`,
- `comment`.

Synchronizacja czasu: opoznienie jest liczone w jednym procesie benchmarka przez monotoniczny zegar `performance.now()`. Runner zapisuje czas tuz przed wyslaniem operacji przez klienta nadawce, a nastepnie liczy roznice po odebraniu odpowiadajacego eventu przez klienta odbiorce. Nie trzeba synchronizowac zegara Windowsa, kontenera i serwera przez NTP, bo probki latency nie bazuja na porownywaniu zegarow roznych maszyn.

WebSocket Kanban:

```powershell
docker compose -f docker-compose.benchmark.yml --profile kanban-ws up -d --build websocket-kanban-server
docker compose -f docker-compose.benchmark.yml --profile runner up -d --build benchmark-runner
docker compose -f docker-compose.benchmark.yml exec benchmark-runner npm run benchmark:kanban -w benchmarks -- `
  --transport websocket `
  --base-url http://websocket-kanban-server:4010 `
  --clients 50 `
  --seed-tasks 500 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

SSE Kanban:

```powershell
docker compose -f docker-compose.benchmark.yml --profile kanban-sse up -d --build sse-kanban-server
docker compose -f docker-compose.benchmark.yml --profile runner up -d --build benchmark-runner
docker compose -f docker-compose.benchmark.yml exec benchmark-runner npm run benchmark:kanban -w benchmarks -- `
  --transport sse `
  --base-url http://sse-kanban-server:4011 `
  --clients 50 `
  --seed-tasks 500 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

Long Polling Kanban:

```powershell
docker compose -f docker-compose.benchmark.yml --profile kanban-lp up -d --build longpolling-kanban-server
docker compose -f docker-compose.benchmark.yml --profile runner up -d --build benchmark-runner
docker compose -f docker-compose.benchmark.yml exec benchmark-runner npm run benchmark:kanban -w benchmarks -- `
  --transport longpolling `
  --base-url http://longpolling-kanban-server:4012 `
  --clients 50 `
  --seed-tasks 500 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

Wyniki:

```text
benchmarks/results/kanban/<transport>/<run-folder>/kanban-<transport>-<runId>.ndjson
benchmarks/results/kanban/<transport>/<run-folder>/kanban-<transport>-<runId>-summary.json
```

Uwaga dla PowerShella: kopiuj tylko komendy, bez linii z potrojnymi backtickami Markdown, czyli bez znakow ``` na poczatku i koncu bloku.

Wszystkie trzy warianty Kanban korzystaja z tych samych danych testowych i tych samych operacji domenowych.

## Automatyczny test z zasobami serwera

Do powtarzalnych przebiegow uzywaj wrappera `suite:kanban`. Uruchamia on potrzebne kontenery, odpala benchmark, zbiera `docker stats` dla testowanego serwera i tworzy rozszerzone summary.

Przyklad:

```powershell
npm run suite:kanban -w benchmarks -- `
  --transport websocket `
  --clients 50 `
  --seed-tasks 500 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

Z degradacja sieci po stronie `benchmark-runner`:

```powershell
npm run suite:kanban -w benchmarks -- `
  --transport sse `
  --clients 50 `
  --seed-tasks 500 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000 `
  --netem delay=100,jitter=30,loss=2
```

Dodatkowe pliki:

```text
benchmarks/results/kanban/<transport>/<run-folder>/kanban-<transport>-<runId>-docker-stats.ndjson
benchmarks/results/kanban/<transport>/<run-folder>/kanban-<transport>-<runId>-full-summary.json
benchmarks/results/kanban/<transport>/<run-folder>/kanban-<transport>-<runId>-summary.csv
benchmarks/results/kanban/<transport>/<run-folder>/kanban-<transport>-<runId>-samples.csv
benchmarks/results/kanban/<transport>/<run-folder>/kanban-<transport>-<runId>-docker-stats.csv
```

`full-summary.json` zawiera:

- latency p50/p95/p99,
- target i actual ops/s,
- delivered events/s,
- errors/pending/lostOrUnmatched,
- CPU/RAM serwera z `docker stats`,
- NetIO serwera i bytes per delivered event.

## Narzedzia zewnetrzne

Do podstawowych wynikow pracy nie trzeba od razu Grafany, Prometheusa, k6 ani Artillery. Obecny runner jest lepszy jako glowny pomiar Kanbana, bo zna logike domenowa i potrafi dopasowac operacje `create/move/update/comment` do odebranych eventow.

Sensowny podzial:

- `benchmark-runner`: glowny pomiar latency, throughput, correctness i reliability domenowej.
- `docker stats`: automatyczny pomiar CPU/RAM/NetIO, dobry do tabel wynikowych.
- `Prometheus + cAdvisor`: przydatne, jezeli chcesz miec szereg czasowy i wykresy z calego przebiegu.
- `Grafana`: wizualizacja, nie zrodlo prawdy dla wynikow.
- `k6` albo `Artillery`: przydatne do prostych testow HTTP/WebSocket, ale dla SSE i long pollingu z korelacja eventow domenowych latwiej utrzymac wlasny runner.

Mozna to w pelni skonteneryzowac, ale do automatycznych tabel najpierw wystarcza `suite:kanban`. Prometheus/Grafana warto dodac pozniej jako profil obserwowalnosci, nie jako wymog kazdego testu.

Opcjonalny profil Prometheus + cAdvisor + Grafana:

```powershell
docker compose -f docker-compose.benchmark.yml --profile observability up -d cadvisor prometheus grafana
```

Adresy:

```text
cAdvisor:   http://localhost:8080
Prometheus: http://localhost:9090
Grafana:    http://localhost:3000  admin/admin
```

Prometheus zbiera metryki kontenerow z cAdvisor co 1s. To jest dobre do wykresow i inspekcji przebiegu, ale liczby raportowane w tabelach pracy najlepiej brac z `*-full-summary.json`, bo sa generowane automatycznie razem z konkretnym przebiegiem testu.

## Chat benchmark

Chat ma osobny scenariusz, bo operacja domenowa to wyslanie wiadomosci do pokoju grupowego. Runner przygotowuje:

- uzytkownikow `bench_chat_user_0001...`,
- pokoj `Benchmark Chat Room`,
- czlonkostwa wszystkich klientow w pokoju,
- haslo wszystkich uzytkownikow: `password123`.

WebSocket:

```powershell
npm run suite:chat -w benchmarks -- `
  --transport websocket `
  --clients 50 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

SSE:

```powershell
npm run suite:chat -w benchmarks -- `
  --transport sse `
  --clients 50 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

Long polling:

```powershell
npm run suite:chat -w benchmarks -- `
  --transport longpolling `
  --clients 50 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

Z degradacja sieci:

```powershell
npm run suite:chat -w benchmarks -- `
  --transport websocket `
  --clients 50 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000 `
  --netem delay=100,jitter=30,loss=2
```

Wyniki:

```text
benchmarks/results/chat/<transport>/<run-folder>/chat-<transport>-<runId>.ndjson
benchmarks/results/chat/<transport>/<run-folder>/chat-<transport>-<runId>-summary.json
benchmarks/results/chat/<transport>/<run-folder>/chat-<transport>-<runId>-docker-stats.ndjson
benchmarks/results/chat/<transport>/<run-folder>/chat-<transport>-<runId>-full-summary.json
benchmarks/results/chat/<transport>/<run-folder>/chat-<transport>-<runId>-summary.csv
benchmarks/results/chat/<transport>/<run-folder>/chat-<transport>-<runId>-samples.csv
benchmarks/results/chat/<transport>/<run-folder>/chat-<transport>-<runId>-docker-stats.csv
```

## Dashboard benchmark

Dashboard jest pasywnym strumieniem danych, wiec benchmark nie wysyla operacji domenowych tak jak Kanban albo Chat. Runner uruchamia wielu klientow i mierzy jak serwer dostarcza kolejne snapshoty symulatora.

Mierzone parametry:

- `freshnessMs`: roznica miedzy `timestamp` snapshotu z serwera a czasem odbioru u klienta,
- `interarrivalMs`: odstep miedzy kolejnymi snapshotami u klienta, czyli jitter dostarczania,
- `rttMs`: okresowy ping WebSocket albo HTTP `/ping`,
- `deliveredSnapshotsPerSec` i `deliveryRatio`,
- `lostBySequenceGap`, `duplicates`, `outOfOrder`, `errors`,
- CPU/RAM/NetIO serwera w `*-full-summary.json`.

WebSocket:

```powershell
npm run suite:dashboard -w benchmarks -- `
  --transport websocket `
  --clients 50 `
  --interval-ms 250 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

SSE:

```powershell
npm run suite:dashboard -w benchmarks -- `
  --transport sse `
  --clients 50 `
  --interval-ms 250 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

Long polling:

```powershell
npm run suite:dashboard -w benchmarks -- `
  --transport longpolling `
  --clients 50 `
  --interval-ms 1000 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

Uwaga: dla pelnego porownania ustaw ten sam `--interval-ms` dla wszystkich transportow. Dla long pollingu warto dodatkowo wykonac osobny scenariusz z `--interval-ms 1000`, bo kazdy snapshot wymaga osobnego cyklu HTTP i bardzo niski interwal jest dla tego wariantu znacznie bardziej kosztowny.

Z degradacja sieci:

```powershell
npm run suite:dashboard -w benchmarks -- `
  --transport sse `
  --clients 50 `
  --interval-ms 250 `
  --warmup-ms 30000 `
  --duration-ms 300000 `
  --netem delay=100,jitter=30,loss=2
```

Wyniki:

```text
benchmarks/results/dashboard/<transport>/<run-folder>/dashboard-<transport>-<runId>.ndjson
benchmarks/results/dashboard/<transport>/<run-folder>/dashboard-<transport>-<runId>-summary.json
benchmarks/results/dashboard/<transport>/<run-folder>/dashboard-<transport>-<runId>-docker-stats.ndjson
benchmarks/results/dashboard/<transport>/<run-folder>/dashboard-<transport>-<runId>-full-summary.json
benchmarks/results/dashboard/<transport>/<run-folder>/dashboard-<transport>-<runId>-summary.csv
benchmarks/results/dashboard/<transport>/<run-folder>/dashboard-<transport>-<runId>-samples.csv
benchmarks/results/dashboard/<transport>/<run-folder>/dashboard-<transport>-<runId>-docker-stats.csv
```

## Whiteboard benchmark

Whiteboard ma warianty WebSocket, SSE i Long Polling. Scenariusz przygotowuje osobna baze `realtime_whiteboard`, tworzy:

- uzytkownikow `bench_whiteboard_user_0001...`,
- jedna tablice `Benchmark Whiteboard <runId>`,
- czlonkostwa wszystkich klientow w tej tablicy,
- poczatkowe elementy canvasu przez `--seed-elements`.

Runner laczy wielu klientow przez WebSocket, dolacza ich do tej samej tablicy i wykonuje mieszany workload:

- `draw`: zakonczenie rysowania sciezki,
- `shape`: dodanie ksztaltu,
- `cursor`: ruch kursora wspolpracownika,
- `update`: edycja istniejacego elementu,
- `delete`: usuniecie elementu.

Mierzone parametry sa takie same jak dla pozostalych aktywnych aplikacji: latency p50/p95/p99 per operacja, throughput, pending/lostOrUnmatched/errors, CPU/RAM/NetIO serwera i bytes per delivered event.

WebSocket:

```powershell
npm run suite:whiteboard -w benchmarks -- `
  --transport websocket `
  --clients 50 `
  --seed-elements 500 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

SSE:

```powershell
npm run suite:whiteboard -w benchmarks -- `
  --transport sse `
  --clients 50 `
  --seed-elements 500 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

Long polling:

```powershell
npm run suite:whiteboard -w benchmarks -- `
  --transport longpolling `
  --clients 50 `
  --seed-elements 500 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000
```

Z degradacja sieci:

```powershell
npm run suite:whiteboard -w benchmarks -- `
  --transport websocket `
  --clients 50 `
  --seed-elements 500 `
  --rate 25 `
  --warmup-ms 30000 `
  --duration-ms 300000 `
  --netem delay=100,jitter=30,loss=2
```

Wyniki:

```text
benchmarks/results/whiteboard/<transport>/<run-folder>/whiteboard-<transport>-<runId>.ndjson
benchmarks/results/whiteboard/<transport>/<run-folder>/whiteboard-<transport>-<runId>-summary.json
benchmarks/results/whiteboard/<transport>/<run-folder>/whiteboard-<transport>-<runId>-docker-stats.ndjson
benchmarks/results/whiteboard/<transport>/<run-folder>/whiteboard-<transport>-<runId>-full-summary.json
benchmarks/results/whiteboard/<transport>/<run-folder>/whiteboard-<transport>-<runId>-summary.csv
benchmarks/results/whiteboard/<transport>/<run-folder>/whiteboard-<transport>-<runId>-samples.csv
benchmarks/results/whiteboard/<transport>/<run-folder>/whiteboard-<transport>-<runId>-docker-stats.csv
```

CSV:

- `<run-folder>` jest tworzony automatycznie z `runId`, parametrow testu i warunkow sieciowych, np. `20260604082443-c50-seed500-r25-warm30000-dur300000-baseline`.
- `*-summary.csv` ma jeden wiersz z pelnym podsumowaniem, parametrami testu, transportem, liczba klientow, rate/interwalem, warunkami `netem`, CPU/RAM i siecia.
- `*-samples.csv` ma pojedyncze probki/eventy z benchmarka oraz te same metadane testu przy kazdym wierszu.
- `*-docker-stats.csv` ma probki `docker stats` serwera z metadanymi przebiegu.

## Matrix runner

Do odpalenia wielu scenariuszy po kolei sluzy `matrix`. Domyslnie planuje:

- aplikacje: `kanban,chat,dashboard,whiteboard`,
- transporty: `websocket,sse,longpolling`,
- klienci: `10,50,100,250,500`,
- siec: `baseline`, `delay=100`, `delay=100,jitter=30`, `delay=100,jitter=30,loss=2`,
- powtorzenia: `5`.

Pelny plan to 1200 przebiegow, wiec najpierw zawsze sprawdz plan:

```powershell
npm run matrix -w benchmarks -- --dry-run
```

Wynik planu:

```text
benchmarks/results/matrix/<matrixRunId>/matrix-plan.csv
```

Uruchomienie wszystkiego:

```powershell
npm run matrix:all -w benchmarks -- --continue-on-error
```

Uruchomienie jednej aplikacji:

```powershell
npm run matrix:kanban -w benchmarks -- --continue-on-error
npm run matrix:chat -w benchmarks -- --continue-on-error
npm run matrix:dashboard -w benchmarks -- --continue-on-error
npm run matrix:whiteboard -w benchmarks -- --continue-on-error
```

To jest praktycznie lepsze niz jeden gigantyczny przebieg, bo latwiej wznowic tylko aplikacje, ktora sie wysypala, i latwiej kontrolowac czas pracy komputera.

Krotka proba przed pelnym przebiegiem:

```powershell
npm run matrix -w benchmarks -- `
  --app kanban `
  --transports websocket `
  --clients 10 `
  --repeats 1 `
  --networks baseline `
  --warmup-ms 5000 `
  --duration-ms 30000
```

Ograniczenie planu do pierwszych N scenariuszy:

```powershell
npm run matrix -w benchmarks -- --app all --limit 3
```

Wlasna macierz:

```powershell
npm run matrix -w benchmarks -- `
  --apps kanban,chat `
  --transports websocket,sse `
  --clients 10,50,100 `
  --repeats 3 `
  --networks baseline,delay100:delay=100,loss2:delay=100,jitter=30,loss=2 `
  --warmup-ms 30000 `
  --duration-ms 300000 `
  --continue-on-error
```

Matrix zapisuje dodatkowo:

```text
benchmarks/results/matrix/<matrixRunId>/matrix-plan.csv
benchmarks/results/matrix/<matrixRunId>/matrix-results.csv
benchmarks/results/matrix/<matrixRunId>/matrix-results.ndjson
```

Kazdy pojedynczy test nadal zapisuje komplet swoich wynikow w:

```text
benchmarks/results/<app>/<transport>/<run-folder>/
```

## Degradacja sieci

Degradacje najlepiej nakladac na kontener `benchmark-runner`, bo symuluje to gorsza siec po stronie klientow testowych.

PowerShell, baseline:

```powershell
$env:TARGET_SERVICE = "benchmark-runner"
docker compose -f docker-compose.benchmark.yml --profile netem run --rm netem clear
Remove-Item Env:TARGET_SERVICE
```

PowerShell, 100 ms opoznienia, 30 ms jittera, 2% strat:

```powershell
$env:TARGET_SERVICE = "benchmark-runner"
$env:NETEM_DELAY_MS = "100"
$env:NETEM_JITTER_MS = "30"
$env:NETEM_LOSS_PERCENT = "2"
docker compose -f docker-compose.benchmark.yml --profile netem run --rm netem apply
Remove-Item Env:TARGET_SERVICE
Remove-Item Env:NETEM_DELAY_MS
Remove-Item Env:NETEM_JITTER_MS
Remove-Item Env:NETEM_LOSS_PERCENT
```

PowerShell, podglad aktywnego `tc`:

```powershell
$env:TARGET_SERVICE = "benchmark-runner"
docker compose -f docker-compose.benchmark.yml --profile netem run --rm netem show
Remove-Item Env:TARGET_SERVICE
```

Bash/WSL, ten sam warunek mieszany:

```bash
TARGET_SERVICE=benchmark-runner \
NETEM_DELAY_MS=100 \
NETEM_JITTER_MS=30 \
NETEM_LOSS_PERCENT=2 \
docker compose -f docker-compose.benchmark.yml --profile netem run --rm netem apply
```

## Stop

```bash
docker compose -f docker-compose.benchmark.yml down
```

Pelne czyszczenie wolumenow bazy:

```bash
docker compose -f docker-compose.benchmark.yml down -v
```
