#!/usr/bin/env bash
# Cross-compiles the agent for every supported target and signs each binary
# with servermend-sign (cmd/servermend-sign — Ed25519 via Go's stdlib, no
# external tool needed), if a signing key is available.
#
# Usage: ./scripts/build-release.sh v0.1.0
#
# Signing is skipped (with a warning, not a failure) when
# SERVERMEND_SIGNING_KEY isn't present — that's fine for a local dev build,
# but CI must have it set, and install.sh refuses to install an unsigned
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

# servermend-sign is cross-compiled per target too and shipped alongside
# the agent binary in each release — the target Linux host has no Go
# toolchain to build it, and install.sh needs it on hand to verify. The
# host-arch copy used to do the signing below is built OUTSIDE $OUT_DIR
# deliberately, so it can never get swept up by a servermend-sign-* glob
# over the release directory (it isn't a release artifact itself).
SIGNER_HOST_BIN="$(mktemp -u)-servermend-sign-host"
go build -o "$SIGNER_HOST_BIN" ./cmd/servermend-sign
trap 'rm -f "$SIGNER_HOST_BIN"' EXIT

for target in "${TARGETS[@]}"; do
  GOOS="${target%/*}"
  GOARCH="${target#*/}"
  out="$OUT_DIR/servermend-sign-${VERSION}-${GOOS}-${GOARCH}"
  echo "building $out"
  GOOS="$GOOS" GOARCH="$GOARCH" CGO_ENABLED=0 go build -ldflags "-s -w" -o "$out" ./cmd/servermend-sign
done

if [[ -n "${SERVERMEND_SIGNING_KEY:-}" ]]; then
  for f in "$OUT_DIR"/servermend-agent-* "$OUT_DIR"/servermend-sign-*; do
    "$SIGNER_HOST_BIN" sign "$SERVERMEND_SIGNING_KEY" "$f"
  done
  echo "signed every binary in $OUT_DIR (.sig alongside each)"
else
  echo "WARNING: skipping signing — SERVERMEND_SIGNING_KEY (path to a .key file from 'servermend-sign keygen') not set. Do not publish binaries from this run."
fi

( cd "$OUT_DIR" && sha256sum servermend-agent-* > SHA256SUMS )
echo "wrote $OUT_DIR/SHA256SUMS"
