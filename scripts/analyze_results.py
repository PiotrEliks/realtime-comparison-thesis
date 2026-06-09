#!/usr/bin/env python3
"""
analyze_results.py — Skrypt analizy wyników benchmarków real-time
=====================================================================
Agreguje dane ze wszystkich *-full-summary.json, wykonuje testy
statystyczne zgodne z metodologią opisaną w rozdziale 3 pracy i
generuje tabele wynikowe.

Wymagania:
    pip install scipy pandas tabulate

Użycie:
    # Pełna analiza wszystkich aplikacji
    python analyze_results.py --results-dir benchmarks/results

    # Tylko jedna aplikacja
    python analyze_results.py --results-dir benchmarks/results --app chat

    # Z własnym katalogiem wyjściowym
    python analyze_results.py --results-dir benchmarks/results --output-dir analysis/

Wygenerowane pliki w --output-dir:
    all_runs.csv           — wszystkie przebiegi (jeden wiersz = jeden przebieg)
    aggregated.csv         — mediana z 5 powtórzeń per scenariusz
    statistical_tests.csv  — testy Mann-Whitney U i Kruskal-Wallis (α=0.05)
    <app>_table.csv        — tabela latencji per aplikacja
    report.txt             — czytelne podsumowanie tekstowe
"""

from __future__ import annotations

import json
import os
import sys
import csv
import glob
import argparse
import math
from pathlib import Path
from collections import defaultdict
from itertools import combinations

# ──────────────────────────────────────────────────────────────────────────────
# Opcjonalne zależności
# ──────────────────────────────────────────────────────────────────────────────
try:
    from scipy import stats as scipy_stats
    SCIPY = True
except ImportError:
    SCIPY = False
    print("⚠  scipy niedostępne — testy statystyczne pominięte. Zainstaluj: pip install scipy")

try:
    import pandas as pd
    PANDAS = True
except ImportError:
    PANDAS = False

try:
    from tabulate import tabulate
    TABULATE = True
except ImportError:
    TABULATE = False

# ──────────────────────────────────────────────────────────────────────────────
# Stałe
# ──────────────────────────────────────────────────────────────────────────────
APPS       = ["chat", "kanban", "whiteboard", "dashboard"]
TRANSPORTS = ["websocket", "sse", "longpolling"]
CLIENTS    = [10, 50, 100, 250, 500]
NETWORK_ORDER = ["baseline", "delay100", "delay100-jitter30", "delay100-jitter30-loss2"]
ALPHA      = 0.05   # poziom istotności (rozdz. 3.1.9)


# ──────────────────────────────────────────────────────────────────────────────
# 1. Wczytywanie danych
# ──────────────────────────────────────────────────────────────────────────────

def find_summaries(results_dir: str) -> list[Path]:
    """Rekursywnie wyszukuje wszystkie *-full-summary.json."""
    pattern = os.path.join(results_dir, "**", "*-full-summary.json")
    files = glob.glob(pattern, recursive=True)
    return [Path(f) for f in sorted(files)]


def get_network_label(params: dict) -> str:
    """Zwraca czytelną etykietę warunków sieciowych."""
    if not params.get("netemEnabled", False):
        return "baseline"
    d   = params.get("netemDelayMs",   0)
    j   = params.get("netemJitterMs",  0)
    lo  = params.get("netemLossPercent", 0)
    if d and j and lo:
        return f"delay{d}-jitter{j}-loss{int(lo)}"
    if d and j:
        return f"delay{d}-jitter{j}"
    if d:
        return f"delay{d}"
    return "unknown"


def extract_latency(data: dict) -> dict:
    """
    Normalizuje pole latencji — różni się między dashboard a pozostałymi.
    Dashboard: data['latency']['freshnessMs'] / data['interarrivalMs']
    Inne:      data['latency']
    """
    app = data.get("app", "")
    lat = data.get("latency", {})

    if app == "dashboard":
        # freshnessMs = data-staleness (czas serwer → klient)
        f = lat.get("freshnessMs", {}) if isinstance(lat, dict) else {}
        ia = data.get("interarrivalMs", {})
        return {
            "lat_p50":  f.get("p50"),
            "lat_p95":  f.get("p95"),
            "lat_p99":  f.get("p99"),
            "lat_min":  f.get("min"),
            "lat_max":  f.get("max"),
            "lat_avg":  f.get("avg"),
            "lat_count": f.get("count"),
            "jitter_p50": ia.get("p50"),
            "jitter_p95": ia.get("p95"),
            "jitter_p99": ia.get("p99"),
        }
    else:
        return {
            "lat_p50":  lat.get("p50"),
            "lat_p95":  lat.get("p95"),
            "lat_p99":  lat.get("p99"),
            "lat_min":  lat.get("min"),
            "lat_max":  lat.get("max"),
            "lat_avg":  lat.get("avg"),
            "lat_count": lat.get("count"),
            "jitter_p50": None,
            "jitter_p95": None,
            "jitter_p99": None,
        }


def extract_reliability(data: dict) -> dict:
    """Normalizuje metryki niezawodności — różni się dla dashboard."""
    app = data.get("app", "")
    rel = data.get("reliability", {})

    if app == "dashboard":
        received = rel.get("received", 0)
        lost     = rel.get("lostBySequenceGap", 0)
        expected = received + lost
        ratio    = received / expected if expected > 0 else None
        thr = data.get("throughput", {})
        return {
            "sent":           expected,
            "delivered":      received,
            "lost":           lost,
            "duplicates":     rel.get("duplicates", 0),
            "out_of_order":   rel.get("outOfOrder", 0),
            "errors":         rel.get("errors", 0),
            "delivery_ratio": thr.get("deliveryRatio", ratio),
        }
    else:
        sent      = rel.get("sent", 0)
        delivered = rel.get("delivered", 0)
        ratio     = delivered / sent if sent > 0 else None
        return {
            "sent":           sent,
            "delivered":      delivered,
            "lost":           rel.get("lostOrUnmatched", 0),
            "duplicates":     rel.get("duplicates", 0),
            "out_of_order":   rel.get("outOfOrder", 0),
            "errors":         rel.get("errors", 0),
            "delivery_ratio": ratio,
        }


def extract_throughput(data: dict) -> dict:
    """Normalizuje przepustowość."""
    app = data.get("app", "")
    thr = data.get("throughput", {})

    if app == "dashboard":
        return {
            "target_ops":  thr.get("targetSnapshotsPerSecPerClient"),
            "actual_ops":  thr.get("deliveredSnapshotsPerSec"),
            "ops_per_sec": thr.get("deliveredSnapshotsPerSecPerClient"),
        }
    else:
        return {
            "target_ops":  thr.get("targetOpsPerSec"),
            "actual_ops":  thr.get("actualOpsPerSec"),
            "ops_per_sec": thr.get("deliveredEventsPerSec"),
        }


def load_record(path: Path) -> dict | None:
    """Wczytuje jeden plik full-summary.json i zwraca spłaszczony rekord."""
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"  ✗ Błąd wczytywania {path}: {e}")
        return None

    params  = data.get("testParameters", {})
    net_raw = data.get("network", {})
    srv     = data.get("serverResources", {})
    cpu     = srv.get("cpu", {})
    mem     = srv.get("memoryBytes", {})

    network = get_network_label(params)

    # Wyodrębniamy numer powtórzenia z runId (rep01..rep05)
    run_id = data.get("runId", "")
    rep = None
    for part in run_id.split("-"):
        if part.startswith("rep"):
            try:
                rep = int(part[3:])
            except ValueError:
                pass

    record = {
        # Identyfikacja
        "run_id":     run_id,
        "app":        data.get("app"),
        "transport":  data.get("transport"),
        "clients":    data.get("clients"),
        "network":    network,
        "rep":        rep,
        "file":       str(path),

        # Parametry testu
        "rate":       data.get("rate"),
        "duration_ms": data.get("durationMs"),
        "warmup_ms":  data.get("warmupMs"),
        "samples":    data.get("samples"),

        # Latencja
        **extract_latency(data),

        # Niezawodność
        **extract_reliability(data),

        # Przepustowość
        **extract_throughput(data),

        # Narzut sieciowy (bajty per dostarczone zdarzenie — rozdz. 3.4.3)
        "bytes_per_event": net_raw.get("bytesPerDeliveredEvent"),
        "net_rx_bytes":    net_raw.get("rxBytes"),
        "net_tx_bytes":    net_raw.get("txBytes"),
        "net_total_bytes": net_raw.get("totalBytes"),

        # Zasoby serwera (rozdz. 3.4.4)
        "cpu_avg":    cpu.get("avg"),
        "cpu_p95":    cpu.get("p95"),
        "cpu_max":    cpu.get("max"),
        "ram_avg_mb": _bytes_to_mb(mem.get("avg")),
        "ram_p95_mb": _bytes_to_mb(mem.get("p95")),
        "ram_max_mb": _bytes_to_mb(mem.get("max")),

        # Warunki sieciowe (szczegóły)
        "netem_enabled":    params.get("netemEnabled", False),
        "netem_delay_ms":   params.get("netemDelayMs", 0),
        "netem_jitter_ms":  params.get("netemJitterMs", 0),
        "netem_loss_pct":   params.get("netemLossPercent", 0),
    }
    return record


def _bytes_to_mb(v):
    return round(v / 1_048_576, 2) if v is not None else None


# ──────────────────────────────────────────────────────────────────────────────
# 2. Agregacja (mediana z 5 powtórzeń)
# ──────────────────────────────────────────────────────────────────────────────

NUMERIC_COLS = [
    "lat_p50", "lat_p95", "lat_p99", "lat_min", "lat_max", "lat_avg", "lat_count",
    "jitter_p50", "jitter_p95", "jitter_p99",
    "sent", "delivered", "lost", "duplicates", "out_of_order", "errors",
    "delivery_ratio",
    "target_ops", "actual_ops", "ops_per_sec",
    "bytes_per_event", "net_rx_bytes", "net_tx_bytes", "net_total_bytes",
    "cpu_avg", "cpu_p95", "cpu_max",
    "ram_avg_mb", "ram_p95_mb", "ram_max_mb",
    "samples",
]


def _median(values):
    clean = [v for v in values if v is not None and not _is_nan(v)]
    if not clean:
        return None
    clean.sort()
    n = len(clean)
    mid = n // 2
    return (clean[mid - 1] + clean[mid]) / 2 if n % 2 == 0 else clean[mid]


def _stdev(values):
    clean = [v for v in values if v is not None and not _is_nan(v)]
    if len(clean) < 2:
        return None
    avg = sum(clean) / len(clean)
    variance = sum((x - avg) ** 2 for x in clean) / (len(clean) - 1)
    return math.sqrt(variance)


def _is_nan(v):
    try:
        return math.isnan(float(v))
    except Exception:
        return False


def aggregate_records(records: list[dict]) -> list[dict]:
    """
    Grupuje rekordy po (app, transport, clients, network) i dla każdej
    grupy oblicza medianę i odchylenie standardowe z powtórzeń.
    Zgodnie z rozdz. 3.1.9: porównujemy mediany per scenariusz.
    """
    groups = defaultdict(list)
    for r in records:
        key = (r["app"], r["transport"], r["clients"], r["network"])
        groups[key].append(r)

    agg = []
    for (app, transport, clients, network), recs in sorted(groups.items()):
        row = {
            "app": app,
            "transport": transport,
            "clients": clients,
            "network": network,
            "n_reps": len(recs),
        }
        for col in NUMERIC_COLS:
            vals = [r.get(col) for r in recs]
            row[f"{col}_median"] = _median(vals)
            row[f"{col}_std"]    = _stdev(vals)
        agg.append(row)
    return agg


# ──────────────────────────────────────────────────────────────────────────────
# 3. Testy statystyczne (rozdz. 3.1.9)
# ──────────────────────────────────────────────────────────────────────────────

def collect_samples_from_ndjson(run_records: list[dict]) -> list[float]:
    """
    Wczytuje surowe próbki latencji z pliku .ndjson powiązanego z rekordem.
    Używane do testów statystycznych na rozkładach (nie tylko percentylach).
    """
    samples = []
    for r in run_records:
        ndjson_path = r.get("file", "").replace("-full-summary.json", ".ndjson")
        if not os.path.exists(ndjson_path):
            # Fallback: szukamy w tym samym katalogu
            parent = Path(r["file"]).parent
            candidates = list(parent.glob("*.ndjson"))
            candidates = [c for c in candidates if "docker" not in c.name]
            if candidates:
                ndjson_path = str(candidates[0])
        if not os.path.exists(ndjson_path):
            continue
        try:
            with open(ndjson_path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    obj = json.loads(line)
                    # Latencja end-to-end
                    v = obj.get("latencyMs") or obj.get("freshnessMs")
                    if v is not None:
                        samples.append(float(v))
        except Exception:
            pass
    return samples


def run_statistical_tests(records: list[dict]) -> list[dict]:
    """
    Przeprowadza testy:
    - Kruskal-Wallis (H-test): 3 technologie jednocześnie  (rozdz. 3.1.9)
    - Mann-Whitney U: każda para transportów               (rozdz. 3.1.9)
    Wyniki per (app, clients, network).
    """
    if not SCIPY:
        return []

    results = []
    # Grupujemy po (app, clients, network)
    groups = defaultdict(lambda: defaultdict(list))
    for r in records:
        key = (r["app"], r["clients"], r["network"])
        groups[key][r["transport"]].append(r)

    for (app, clients, network), transport_map in sorted(groups.items()):
        # Zbieramy próbki dla każdego transportu
        samples_by_transport = {}
        for transport, recs in transport_map.items():
            s = collect_samples_from_ndjson(recs)
            if not s:
                # Fallback: użyj p50 z każdego powtórzenia
                s = [r["lat_p50"] for r in recs if r.get("lat_p50") is not None]
            if s:
                samples_by_transport[transport] = s

        available = list(samples_by_transport.keys())
        if len(available) < 2:
            continue

        # ─── Kruskal-Wallis (dla ≥3 grup) ────────────────────────────────
        if len(available) >= 3:
            sample_lists = [samples_by_transport[t] for t in available]
            try:
                h_stat, p_kw = scipy_stats.kruskal(*sample_lists)
                results.append({
                    "test": "Kruskal-Wallis",
                    "app": app,
                    "clients": clients,
                    "network": network,
                    "group_a": "+".join(sorted(available)),
                    "group_b": "",
                    "statistic": round(h_stat, 4),
                    "p_value": round(p_kw, 6),
                    "significant": p_kw < ALPHA,
                    "alpha": ALPHA,
                    "n_samples": sum(len(s) for s in sample_lists),
                })
            except Exception as e:
                pass

        # ─── Mann-Whitney U (porównania parami) ──────────────────────────
        for t_a, t_b in combinations(sorted(available), 2):
            s_a = samples_by_transport[t_a]
            s_b = samples_by_transport[t_b]
            try:
                u_stat, p_mw = scipy_stats.mannwhitneyu(
                    s_a, s_b, alternative="two-sided"
                )
                # Efekt rankowy (r = Z / sqrt(N))
                n_total = len(s_a) + len(s_b)
                # Przybliżenie Z dla dużych prób (rozdz. 3.1.9)
                z_approx = (u_stat - len(s_a) * len(s_b) / 2) / math.sqrt(
                    len(s_a) * len(s_b) * (n_total + 1) / 12
                ) if n_total > 25 else None

                results.append({
                    "test": "Mann-Whitney-U",
                    "app": app,
                    "clients": clients,
                    "network": network,
                    "group_a": t_a,
                    "group_b": t_b,
                    "statistic": round(u_stat, 2),
                    "p_value": round(p_mw, 6),
                    "significant": p_mw < ALPHA,
                    "alpha": ALPHA,
                    "n_a": len(s_a),
                    "n_b": len(s_b),
                    "z_approx": round(z_approx, 4) if z_approx else None,
                })
            except Exception:
                pass

    return results


# ──────────────────────────────────────────────────────────────────────────────
# 4. Formatowanie i wydruk
# ──────────────────────────────────────────────────────────────────────────────

def fmt(v, decimals=2):
    if v is None:
        return "—"
    try:
        return f"{float(v):.{decimals}f}"
    except (TypeError, ValueError):
        return str(v)


def print_latency_table(agg_records: list[dict], app: str) -> str:
    """
    Zwraca tabelę latencji p50/p95/p99 dla danej aplikacji
    w formacie czytelnym dla rozdziału 5.
    """
    rows = [r for r in agg_records if r["app"] == app]
    if not rows:
        return f"Brak danych dla aplikacji: {app}\n"

    lines = []
    lines.append(f"\n{'='*80}")
    lines.append(f"  APLIKACJA: {app.upper()}")
    lines.append(f"{'='*80}")

    for network in NETWORK_ORDER:
        net_rows = [r for r in rows if r["network"] == network]
        if not net_rows:
            continue

        lines.append(f"\n  Warunki sieciowe: {network}")
        lines.append(f"  {'-'*76}")

        header = f"  {'Transport':<15} {'Klienci':>8} {'p50 [ms]':>10} {'p95 [ms]':>10} "
        header += f"{'p99 [ms]':>10} {'Delivery':>10} {'CPU avg%':>10} {'RAM MB':>8}"
        lines.append(header)
        lines.append(f"  {'-'*76}")

        for transport in TRANSPORTS:
            for clients in CLIENTS:
                r = next(
                    (x for x in net_rows
                     if x["transport"] == transport and x["clients"] == clients),
                    None
                )
                if not r:
                    continue
                dr = r.get("delivery_ratio_median")
                dr_str = f"{dr*100:.1f}%" if dr is not None else "—"
                line = (
                    f"  {transport:<15} {clients:>8} "
                    f"{fmt(r.get('lat_p50_median')):>10} "
                    f"{fmt(r.get('lat_p95_median')):>10} "
                    f"{fmt(r.get('lat_p99_median')):>10} "
                    f"{dr_str:>10} "
                    f"{fmt(r.get('cpu_avg_median')):>10} "
                    f"{fmt(r.get('ram_avg_mb_median')):>8}"
                )
                lines.append(line)

    return "\n".join(lines) + "\n"


def print_scalability_table(agg_records: list[dict], app: str) -> str:
    """Tabela skalowalności: latencja p95 vs liczba klientów per transport."""
    rows = [r for r in agg_records if r["app"] == app and r["network"] == "baseline"]
    if not rows:
        return ""

    lines = []
    lines.append(f"\n  SKALOWALNOŚĆ ({app.upper()} / baseline)")
    lines.append(f"  Latencja p95 [ms] w zależności od liczby klientów")
    lines.append(f"  {'Transport':<15} " + "  ".join(f"{c:>8}" for c in CLIENTS))
    lines.append(f"  {'-'*70}")

    for transport in TRANSPORTS:
        vals = []
        for clients in CLIENTS:
            r = next(
                (x for x in rows if x["transport"] == transport and x["clients"] == clients),
                None
            )
            vals.append(fmt(r.get("lat_p95_median") if r else None))
        lines.append(f"  {transport:<15} " + "  ".join(f"{v:>8}" for v in vals))

    return "\n".join(lines) + "\n"


def print_network_impact(agg_records: list[dict], app: str, clients: int = 50) -> str:
    """Tabela wpływu warunków sieciowych na latencję p95 przy N klientach."""
    rows = [r for r in agg_records if r["app"] == app and r["clients"] == clients]
    if not rows:
        return ""

    lines = []
    lines.append(f"\n  WPŁYW WARUNKÓW SIECIOWYCH ({app.upper()} / {clients} klientów)")
    lines.append(f"  Latencja p95 [ms]")
    lines.append(f"  {'Transport':<15} " + "  ".join(f"{n:>30}" for n in NETWORK_ORDER))
    lines.append(f"  {'-'*110}")

    for transport in TRANSPORTS:
        vals = []
        for network in NETWORK_ORDER:
            r = next(
                (x for x in rows if x["transport"] == transport and x["network"] == network),
                None
            )
            vals.append(fmt(r.get("lat_p95_median") if r else None))
        lines.append(f"  {transport:<15} " + "  ".join(f"{v:>30}" for v in vals))

    return "\n".join(lines) + "\n"


def print_network_overhead(agg_records: list[dict]) -> str:
    """Tabela narzutu sieciowego (bajty per zdarzenie) dla baseline."""
    lines = []
    lines.append("\n  NARZUT SIECIOWY — bajty per dostarczone zdarzenie (baseline)")
    lines.append(f"  {'App':<12} {'Transport':<15} {'10 kl.':>10} {'50 kl.':>10} "
                 f"{'100 kl.':>10} {'250 kl.':>10} {'500 kl.':>10}")
    lines.append(f"  {'-'*80}")

    for app in APPS:
        for transport in TRANSPORTS:
            vals = []
            for clients in CLIENTS:
                r = next(
                    (x for x in agg_records
                     if x["app"] == app and x["transport"] == transport
                     and x["clients"] == clients and x["network"] == "baseline"),
                    None
                )
                v = r.get("bytes_per_event_median") if r else None
                vals.append(fmt(v, 0) if v and v < 1_000_000 else fmt(v, 0))
            lines.append(
                f"  {app:<12} {transport:<15} " +
                "  ".join(f"{v:>10}" for v in vals)
            )

    return "\n".join(lines) + "\n"


# ──────────────────────────────────────────────────────────────────────────────
# 5. Zapis do plików
# ──────────────────────────────────────────────────────────────────────────────

def save_csv(rows: list[dict], path: str):
    if not rows:
        print(f"  ⚠ Brak danych do zapisu: {path}")
        return
    keys = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    print(f"  ✓ Zapisano: {path}  ({len(rows)} wierszy)")


def save_report(text: str, path: str):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  ✓ Zapisano raport: {path}")


# ──────────────────────────────────────────────────────────────────────────────
# 6. Diagnostyka kompletności danych
# ──────────────────────────────────────────────────────────────────────────────

def print_completeness(records: list[dict]):
    """
    Sprawdza ile powtórzeń mamy per scenariusz.
    Oczekiwane: 5 powtórzeń per (app, transport, clients, network).
    """
    counts = defaultdict(int)
    for r in records:
        key = (r["app"], r["transport"], r["clients"], r["network"])
        counts[key] += 1

    missing = []
    for app in APPS:
        for transport in TRANSPORTS:
            for clients in CLIENTS:
                for network in NETWORK_ORDER:
                    key = (app, transport, clients, network)
                    n = counts.get(key, 0)
                    if n < 5:
                        missing.append((app, transport, clients, network, n))

    total_expected = len(APPS) * len(TRANSPORTS) * len(CLIENTS) * len(NETWORK_ORDER) * 5
    total_found = len(records)

    print(f"\n📊 KOMPLETNOŚĆ DANYCH")
    print(f"  Znaleziono przebiegów: {total_found} / {total_expected} oczekiwanych")
    print(f"  Kompletnych scenariuszy (5/5 powtórzeń): "
          f"{sum(1 for k, n in counts.items() if n >= 5)}")

    if missing:
        print(f"\n  ⚠ Niekompletne scenariusze ({len(missing)}):")
        for app, transport, clients, network, n in missing[:20]:
            print(f"    {app}/{transport} clients={clients} network={network}: {n}/5 powtórzeń")
        if len(missing) > 20:
            print(f"    ... i {len(missing) - 20} więcej")
    else:
        print("  ✓ Wszystkie scenariusze mają 5 powtórzeń")


# ──────────────────────────────────────────────────────────────────────────────
# 7. Główna funkcja
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Analiza wyników benchmarków real-time (rozdz. 3 metodologia)"
    )
    parser.add_argument(
        "--results-dir", "-r",
        default="benchmarks/results",
        help="Katalog główny z wynikami (domyślnie: benchmarks/results)"
    )
    parser.add_argument(
        "--output-dir", "-o",
        default="analysis",
        help="Katalog wyjściowy (domyślnie: analysis/)"
    )
    parser.add_argument(
        "--app", "-a",
        choices=APPS + ["all"],
        default="all",
        help="Aplikacja do analizy (domyślnie: all)"
    )
    parser.add_argument(
        "--no-stats",
        action="store_true",
        help="Pomiń testy statystyczne (szybsze wykonanie)"
    )
    parser.add_argument(
        "--completeness-only",
        action="store_true",
        help="Tylko sprawdź kompletność danych, bez pełnej analizy"
    )
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # ─── Wczytywanie ─────────────────────────────────────────────────────────
    print(f"\n🔍 Skanowanie: {args.results_dir}")
    paths = find_summaries(args.results_dir)
    print(f"  Znaleziono plików: {len(paths)}")

    if not paths:
        print("  ✗ Brak plików *-full-summary.json. Sprawdź ścieżkę --results-dir")
        sys.exit(1)

    records = []
    for p in paths:
        r = load_record(p)
        if r:
            records.append(r)
    print(f"  Wczytano rekordów: {len(records)}")

    # Filtrowanie po aplikacji
    if args.app != "all":
        records = [r for r in records if r["app"] == args.app]
        print(f"  Po filtrze --app={args.app}: {len(records)} rekordów")

    print_completeness(records)

    if args.completeness_only:
        return

    # ─── Agregacja ────────────────────────────────────────────────────────────
    print("\n📐 Agregacja (mediana z powtórzeń)...")
    agg = aggregate_records(records)
    print(f"  Zagregowanych scenariuszy: {len(agg)}")

    # ─── Testy statystyczne ──────────────────────────────────────────────────
    stat_results = []
    if not args.no_stats and SCIPY:
        print("\n📈 Testy statystyczne (Mann-Whitney U + Kruskal-Wallis, α=0.05)...")
        stat_results = run_statistical_tests(records)
        sig = sum(1 for r in stat_results if r.get("significant"))
        print(f"  Wykonano testów: {len(stat_results)}, istotnych: {sig}")
    elif not SCIPY:
        print("\n⚠  Testy statystyczne pominięte (brak scipy)")

    # ─── Zapis CSV ───────────────────────────────────────────────────────────
    print("\n💾 Zapis plików...")
    save_csv(records, os.path.join(args.output_dir, "all_runs.csv"))
    save_csv(agg, os.path.join(args.output_dir, "aggregated.csv"))
    if stat_results:
        save_csv(stat_results, os.path.join(args.output_dir, "statistical_tests.csv"))

    # CSV per aplikacja (wygodne do importu w R / Excel)
    for app in APPS:
        app_rows = [r for r in agg if r["app"] == app]
        if app_rows:
            save_csv(
                app_rows,
                os.path.join(args.output_dir, f"{app}_aggregated.csv")
            )

    # ─── Raport tekstowy ─────────────────────────────────────────────────────
    print("\n📝 Generowanie raportu tekstowego...")
    report_parts = []
    report_parts.append("RAPORT WYNIKÓW BENCHMARKÓW REAL-TIME")
    report_parts.append("=" * 80)
    report_parts.append(f"Wyniki z: {args.results_dir}")
    report_parts.append(f"Wczytanych przebiegów: {len(records)}")
    report_parts.append(f"Zagregowanych scenariuszy: {len(agg)}")
    report_parts.append("")

    apps_to_report = APPS if args.app == "all" else [args.app]
    for app in apps_to_report:
        report_parts.append(print_latency_table(agg, app))
        report_parts.append(print_scalability_table(agg, app))
        report_parts.append(print_network_impact(agg, app, clients=50))
        report_parts.append(print_network_impact(agg, app, clients=100))

    report_parts.append(print_network_overhead(agg))

    # Podsumowanie testów statystycznych
    if stat_results:
        report_parts.append("\n  PODSUMOWANIE TESTÓW STATYSTYCZNYCH (α=0.05)")
        report_parts.append(f"  {'='*60}")
        for app in apps_to_report:
            kw = [r for r in stat_results if r["test"] == "Kruskal-Wallis" and r["app"] == app]
            mw = [r for r in stat_results if r["test"] == "Mann-Whitney-U" and r["app"] == app]
            sig_kw = sum(1 for r in kw if r["significant"])
            sig_mw = sum(1 for r in mw if r["significant"])
            report_parts.append(
                f"\n  {app.upper()}: Kruskal-Wallis istotnych {sig_kw}/{len(kw)}, "
                f"Mann-Whitney istotnych {sig_mw}/{len(mw)}"
            )
            # Top różnice per scenariusz (baseline, 50 klientów)
            key_tests = [
                r for r in mw
                if r["network"] == "baseline" and r["clients"] == 50
            ]
            for t in sorted(key_tests, key=lambda x: x["p_value"]):
                sig_marker = "✓" if t["significant"] else "✗"
                report_parts.append(
                    f"    {sig_marker} {t['group_a']:>12} vs {t['group_b']:<12} "
                    f"p={t['p_value']:.4f}  U={t['statistic']:.0f}"
                )

    report_text = "\n".join(report_parts)
    print(report_text)
    save_report(report_text, os.path.join(args.output_dir, "report.txt"))

    print(f"\n✅ Analiza zakończona. Pliki w: {args.output_dir}/")
    print("   all_runs.csv        — surowe dane wszystkich przebiegów")
    print("   aggregated.csv      — mediany z 5 powtórzeń")
    if stat_results:
        print("   statistical_tests.csv — testy Mann-Whitney U i Kruskal-Wallis")
    print("   <app>_aggregated.csv — dane per aplikacja")
    print("   report.txt          — raport tekstowy")


if __name__ == "__main__":
    main()