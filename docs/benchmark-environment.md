# Srodowisko testowe dla benchmarkow real-time

Ten projekt jest rozwijany na Windowsie, ale testy z degradacja sieci powinny byc wykonywane w Linuksie. `tc netem` jest narzedziem jadra Linux, dlatego Windows powinien byc traktowany jako host developerski, a nie jako wlasciwe srodowisko pomiarowe.

## Rekomendowana topologia

Najbardziej powtarzalny wariant:

```text
Windows 11
  |
  +-- Docker Desktop z backendem WSL2
        |
        +-- postgres / redis
        +-- server under test: WebSocket albo SSE albo long polling
        +-- benchmark runner
        +-- opcjonalnie: kontener do tc/netem z NET_ADMIN
```

Wyniki pracy magisterskiej powinny pochodzic z tej samej topologii dla kazdego transportu. Nie nalezy porownywac wynikow z czesci testow uruchomionych natywnie na Windowsie i czesci w WSL2/Dockerze.

## Szybki wariant: WSL2

Ten wariant jest dobry do pierwszych prob i walidacji scenariuszy.

1. Zainstaluj WSL2 i dystrybucje Ubuntu.
2. Wejdz do katalogu projektu z poziomu WSL, najlepiej przez sciezke linuxowa, a nie `/mnt/c`, jezeli benchmark ma byc intensywny.
3. Zainstaluj zaleznosci:

```bash
sudo apt update
sudo apt install -y nodejs npm iproute2 iputils-ping net-tools sysstat tcpdump tshark
npm install
```

4. Uruchom baze:

```bash
docker compose up -d postgres redis
```

5. Uruchom wybrany serwer i generator obciazenia w WSL.

Przy ruchu lokalnym mozna zalozyc degradacje na interfejs `lo`:

```bash
sudo tc qdisc add dev lo root netem delay 100ms
sudo tc qdisc change dev lo root netem delay 100ms 30ms loss 2%
sudo tc qdisc del dev lo root
```

Ograniczenie: `lo` dotyka calego ruchu lokalnego w WSL. To wystarcza do pierwszych testow, ale do wynikow koncowych lepiej uzyc osobnych kontenerow.

## Docelowy wariant: Docker + osobne kontenery

Docelowo generator obciazenia i testowany serwer powinny byc w osobnych kontenerach w tej samej sieci Dockera. Degradacje naklada sie na interfejs `eth0` kontenera generatora albo serwera.

Przyklad topologii:

```text
benchmark-runner  -->  server-under-test  -->  postgres
       eth0                  eth0
        |                     |
      tc netem             bez zmian albo osobny netem
```

Najczystsze porownanie:

- degradacja na `benchmark-runner eth0`: symuluje gorsza siec po stronie klientow,
- degradacja na `server-under-test eth0`: symuluje gorsza siec po stronie serwera,
- jedna konfiguracja degradacji na raz,
- restart procesu serwera przed kazdym duzym przebiegiem.

Kontener, na ktorym uruchamiasz `tc`, musi miec uprawnienia:

```yaml
cap_add:
  - NET_ADMIN
```

## Warunki sieciowe

Zapisuj kazda konfiguracje razem z wynikami.

Baseline:

```bash
sudo tc qdisc del dev eth0 root 2>/dev/null || true
```

Stale opoznienie:

```bash
sudo tc qdisc add dev eth0 root netem delay 50ms
sudo tc qdisc change dev eth0 root netem delay 150ms
```

Opoznienie z jitterem:

```bash
sudo tc qdisc change dev eth0 root netem delay 100ms 30ms
```

Utrata pakietow:

```bash
sudo tc qdisc change dev eth0 root netem loss 1%
sudo tc qdisc change dev eth0 root netem loss 3%
sudo tc qdisc change dev eth0 root netem loss 5%
```

Warunek mieszany:

```bash
sudo tc qdisc change dev eth0 root netem delay 100ms 30ms loss 2%
```

Ograniczenie przepustowosci:

```bash
sudo tc qdisc change dev eth0 root netem rate 5mbit delay 100ms loss 1%
```

Sprzatanie po tescie:

```bash
sudo tc qdisc del dev eth0 root
```

## Porty serwerow w projekcie

Aktualne porty backendow:

```text
4001 websocket-chat-server
4002 sse-chat-server
4003 longpolling-chat-server
4005 websocket-dashboard-server
4006 sse-dashboard-server
4007 longpolling-dashboard-server
4010 websocket-kanban-server
4011 sse-kanban-server
4012 longpolling-kanban-server
5001 websocket-whiteboard-server REST
5002 websocket-whiteboard-server WS
```

Uwaga: `webrtc-signaling-server` domyslnie uzywa `4004` i `4005`, co koliduje z `websocket-dashboard-server` na porcie `4005`, jezeli uruchomisz wszystko naraz. Do benchmarkow uruchamiaj tylko jeden testowany transport/aplikacje naraz albo ustaw inne porty przez zmienne srodowiskowe.

## Izolacja przebiegow

Dla kazdego przebiegu:

1. Ustaw warunki sieciowe.
2. Uruchom lub zrestartuj testowany serwer.
3. Poczekaj na health check.
4. Uruchom generator obciazenia.
5. Zrob warm-up, np. 2 minuty.
6. Zbieraj wyniki, np. 10 minut.
7. Zapisz surowe wyniki JSON/CSV.
8. Zapisz metryki systemowe.
9. Usun `tc qdisc`.

Nie lacz wynikow z przebiegow, w ktorych zmienialy sie wersje kodu, parametry bazy, liczba klientow, payload albo konfiguracja sieci.

## Metryki systemowe

Przydatne komendy w Linuksie:

```bash
pidstat -u -r -p <PID> 1
ss -tan | wc -l
ss -tan state established | wc -l
docker stats
tcpdump -i eth0 -w run.pcap
tshark -r run.pcap -q -z conv,tcp
```

Do pracy magisterskiej zapisuj przynajmniej:

- CPU procesu serwera,
- RAM procesu serwera,
- liczbe aktywnych polaczen,
- bajty wyslane i odebrane,
- liczbe requestow lub komunikatow na sekunde,
- liczbe bledow i reconnectow.

## Minimalny plan testow

Dla kazdej pary aplikacja/transport:

```text
clients: 10, 50, 100, 250, 500
duration: 2 min warm-up + 10 min pomiar
repetitions: 5
network:
  - baseline
  - delay 50ms
  - delay 150ms
  - delay 100ms jitter 30ms
  - loss 1%
  - loss 3%
  - delay 100ms jitter 30ms loss 2%
```

Wyniki agreguj dopiero po zapisaniu surowych probek. Dla opoznien raportuj `p50`, `p95`, `p99`, srednia moze byc tylko metryka pomocnicza.
