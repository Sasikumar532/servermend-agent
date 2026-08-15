#!/usr/bin/env bash
# Installs the ServerMend agent as a systemd-managed, scheduled service.
# Run as root: sudo ./install.sh /path/to/servermend-agent
#
# See ../PERMISSIONS.md for why this runs as root (sandboxed via systemd)
# rather than a dedicated low-privilege user.
set -euo pipefail

BINARY_SRC="${1:-./servermend-agent}"
INSTALL_DIR="/opt/servermend"
BINARY_DEST="$INSTALL_DIR/servermend-agent"
BASELINE_DIR="/var/lib/servermend"
CONFIG_DIR="/etc/servermend"
UNIT_DIR="/etc/systemd/system"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "install.sh must be run as root (it installs a systemd unit and creates /var/lib/servermend)" >&2
  exit 1
fi

if [[ ! -f "$BINARY_SRC" ]]; then
  echo "binary not found: $BINARY_SRC" >&2
  echo "build it first: ./scripts/build-release.sh <version>" >&2
  exit 1
fi

# Refuse to install an unsigned binary unless the operator explicitly opts
# out (e.g. a local dev build) — signature verification is the whole point
# of shipping signed releases.
if [[ -f "$BINARY_SRC.minisig" ]]; then
  if ! command -v minisign >/dev/null 2>&1; then
    echo "found $BINARY_SRC.minisig but minisign isn't installed — install it or pass ALLOW_UNSIGNED=1 to skip verification" >&2
    exit 1
  fi
  if [[ -z "${SERVERMEND_PUBLIC_KEY:-}" ]]; then
    echo "found $BINARY_SRC.minisig but SERVERMEND_PUBLIC_KEY isn't set — export the release public key first" >&2
    exit 1
  fi
  if ! minisign -V -P "$SERVERMEND_PUBLIC_KEY" -m "$BINARY_SRC"; then
    echo "signature verification FAILED for $BINARY_SRC — refusing to install" >&2
    exit 1
  fi
  echo "signature verified."
elif [[ "${ALLOW_UNSIGNED:-}" != "1" ]]; then
  echo "no $BINARY_SRC.minisig found and ALLOW_UNSIGNED is not set — refusing to install an unsigned binary" >&2
  echo "(set ALLOW_UNSIGNED=1 for local/dev builds)" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$BASELINE_DIR" "$CONFIG_DIR"
install -m 0755 "$BINARY_SRC" "$BINARY_DEST"
chmod 0750 "$BASELINE_DIR"

if [[ ! -f "$CONFIG_DIR/agent.env" ]]; then
  cat > "$CONFIG_DIR/agent.env" <<'EOF'
# Filled in by hand until the backend issues these automatically.
SERVER_ID=
BACKEND_URL=
API_KEY=
EOF
  chmod 0600 "$CONFIG_DIR/agent.env"
  echo "Wrote $CONFIG_DIR/agent.env — fill in SERVER_ID, BACKEND_URL, API_KEY before starting the timer."
fi

cp "$SCRIPT_DIR/servermend-agent.service" "$UNIT_DIR/"
cp "$SCRIPT_DIR/servermend-agent.timer" "$UNIT_DIR/"

systemctl daemon-reload
systemctl enable servermend-agent.timer

echo "Installed. Once $CONFIG_DIR/agent.env is filled in, run:"
echo "  systemctl start servermend-agent.timer"
echo "Or for a one-off run right now:"
echo "  systemctl start servermend-agent.service"
