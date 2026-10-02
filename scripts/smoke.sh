#!/usr/bin/env bash

set -Eeuo pipefail

if [[ -z "${APP_URL:-}" ]]; then
  echo "ERROR: APP_URL is not set."
  echo "Example:"
  echo "  export APP_URL=https://example.lambda-url.us-east-1.on.aws/"
  exit 1
fi

BASE_URL="${APP_URL%/}"

echo "CallMissed AI Workspace smoke test"
echo "Target: ${BASE_URL}"
echo

echo "[1/3] Liveness"
curl --fail --silent --show-error \
  "${BASE_URL}/health/live"
echo
echo "PASS"
echo

echo "[2/3] Readiness"
curl --fail --silent --show-error \
  "${BASE_URL}/health/ready"
echo
echo "PASS"
echo

echo "[3/3] Frontend"
HTTP_STATUS="$(
  curl \
    --silent \
    --output /dev/null \
    --write-out "%{http_code}" \
    "${BASE_URL}/chat"
)"

if [[ "${HTTP_STATUS}" != "200" ]]; then
  echo "FAIL: /chat returned HTTP ${HTTP_STATUS}"
  exit 1
fi

echo "PASS"
echo

echo "Smoke test passed."