# Real-time Communication Technologies Comparison

Praca magisterska porównująca technologie komunikacji czasu rzeczywistego w aplikacjach webowych.

## Technologie

- WebSocket
- Server-Sent Events (SSE)
- Long Polling
- WebRTC

## Scenariusze testowe

1. **Kanban Board** - collaborative task management
2. **Chat** - real-time messaging
3. **Dashboard** - live data streaming

## Instalacja

```bash
npm install
```

## Uruchomienie

```bash
# Wszystkie serwery
npm run dev:servers

# Wszystkie aplikacje Kanban
npm run dev:kanban

# Pojedyncza aplikacja
npm run dev -w kanban-websocket
```

## Struktura projektu

- `packages/` - współdzielone pakiety (UI, adaptery, metryki)
- `apps/` - aplikacje frontendowe (12 aplikacji)
- `servers/` - serwery backendowe (4 serwery + shared)
- `benchmarks/` - testy wydajnościowe
- `docs/` - dokumentacja

## Testowanie wydajności

```bash
npm run benchmark
```
