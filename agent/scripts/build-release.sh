#!/usr/bin/env bash
# Cross-compiles the agent for every supported target and signs each binary
# with minisign, if a signing key is available.
#
# Usage: ./scripts/build-release.sh v0.1.0
#
# Signing is skipped (with a warning, not a failure) when minisign or
# SERVERMEND_SIGNING_KEY isn't present — that's fine for a local dev build,
# but CI must have both set, and install.sh refuses to install an unsigned
# binary without an explicit override.
set -euo pipefail

VERSION="${1:-dev}"
OUT_DIR="dist"
TARGETS=("linux/amd64" "linux/arm64")

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

for target in "${TARGETS[@]}"; do
  GOOS="${target%/*}"
  GOARCH="${target#*/}"
  out="$OUT_DIR/servermend-agent-${VERSION}-${GOOS}-${GOARCH}"
  echo "building $out"
  GOOS="$GOOS" GOARCH="$GOARCH" CGO_ENABLED=0 go build \
    -ldflags "-X main.agentVersion=${VERSION} -s -w" \
    -o "$out" ./cmd/servermend-agent
done

if command -v minisign >/dev/null 2>&1 && [[ -n "${SERVERMEND_SIGNING_KEY:-}" ]]; then
  for f in "$OUT_DIR"/servermend-agent-*; do
    minisign -S -s "$SERVERMEND_SIGNING_KEY" -m "$f"
  done
  echo "signed every binary in $OUT_DIR (.minisig alongside each)"
else
  echo "WARNING: skipping signing — minisign not found or SERVERMEND_SIGNING_KEY not set. Do not publish binaries from this run."
fi

( cd "$OUT_DIR" && sha256sum servermend-agent-* > SHA256SUMS )
echo "wrote $OUT_DIR/SHA256SUMS"
