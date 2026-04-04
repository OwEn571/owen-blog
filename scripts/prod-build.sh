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
  echo "BLOG_DATA_DIR is required in production builds."
  exit 1
fi

mkdir -p "${BLOG_DATA_DIR}"

export HOME="/home/ubuntu/owen"
export COREPACK_HOME="${COREPACK_HOME:-/home/ubuntu/owen/.cache/node/corepack}"
export PYTHON="${PYTHON:-/home/ubuntu/miniconda3/envs/blog/bin/python}"

unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY

PNPM_BIN="$(find "${COREPACK_HOME}/v1/pnpm" -maxdepth 3 -path "*/bin/pnpm.cjs" | sort -V | tail -n 1)"

if [[ -z "${PNPM_BIN}" || ! -f "${PNPM_BIN}" ]]; then
  echo "Cannot find a cached pnpm executable under ${COREPACK_HOME}."
  exit 1
fi

node "${PNPM_BIN}" build
