#!/bin/bash

# Post-action hook for patchbook
# Generates the dashboard from real .patchbook/ data after mutations

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Build the project to ensure dist/ is up-to-date
npm run build --prefix "${PROJECT_ROOT}" >/dev/null 2>&1 || true

# Generate the dashboard from real .patchbook/ data
node -e "const { saveDashboard } = require('${PROJECT_ROOT}/dist/patchbook/generate-dashboard'); try { const output = saveDashboard('${PROJECT_ROOT}/web/patchbook-dashboard.html'); console.log('Dashboard generated:', output); } catch (err) { console.error('Dashboard generation failed:', err.message); exit(1); }"
