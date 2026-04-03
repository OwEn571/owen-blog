#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${ROOT_DIR}/scripts/prod-build.sh"
sudo systemctl daemon-reload
sudo systemctl enable owen-blog.service
sudo systemctl restart owen-blog.service
sudo systemctl --no-pager --full status owen-blog.service
