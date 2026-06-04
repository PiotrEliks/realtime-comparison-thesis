#!/usr/bin/env bash
set -euo pipefail

DEV="${NETEM_DEV:-eth0}"
MODE="${1:-apply}"

cleanup() {
  tc qdisc del dev "$DEV" root 2>/dev/null || true
}

case "$MODE" in
  clear)
    cleanup
    echo "netem cleared on $DEV"
    ;;
  show)
    tc qdisc show dev "$DEV"
    ;;
  apply)
    DELAY_MS="${NETEM_DELAY_MS:-0}"
    JITTER_MS="${NETEM_JITTER_MS:-0}"
    LOSS_PERCENT="${NETEM_LOSS_PERCENT:-0}"
    RATE="${NETEM_RATE:-}"

    cleanup

    args=()
    if [ "$DELAY_MS" != "0" ]; then
      args+=(delay "${DELAY_MS}ms")
      if [ "$JITTER_MS" != "0" ]; then
        args+=("${JITTER_MS}ms")
      fi
    fi

    if [ "$LOSS_PERCENT" != "0" ]; then
      args+=(loss "${LOSS_PERCENT}%")
    fi

    if [ -n "$RATE" ]; then
      args+=(rate "$RATE")
    fi

    if [ "${#args[@]}" -eq 0 ]; then
      echo "no netem settings requested; leaving $DEV clean"
      tc qdisc show dev "$DEV"
      exit 0
    fi

    tc qdisc add dev "$DEV" root netem "${args[@]}"
    echo "netem applied on $DEV: ${args[*]}"
    tc qdisc show dev "$DEV"
    ;;
  *)
    echo "usage: netem apply|clear|show" >&2
    exit 2
    ;;
esac

