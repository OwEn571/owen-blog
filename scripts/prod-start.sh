#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.production"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

cd "${ROOT_DIR}"

if [[ -z "${BLOG_DATA_DIR:-}" ]]; then
  echo "BLOG_DATA_DIR is required in production runtime."
  exit 1
fi

mkdir -p "${BLOG_DATA_DIR}"

export HOME="/home/ubuntu/owen"
export NODE_ENV="${NODE_ENV:-production}"
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-4321}"

exec node ./dist/server/entry.mjs
