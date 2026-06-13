#!/bin/bash

# Post-action hook for patchbook
# Checks if .patchbook storage dir exists and marks dashboard for refresh

set -e

PATCHBOOK_DIR=".patchbook"
REFRESH_MARKER=".patchbook-dashboard-needs-refresh"

if [ -d "$PATCHBOOK_DIR" ]; then
  touch "$REFRESH_MARKER"
  exit 0
fi

exit 0
