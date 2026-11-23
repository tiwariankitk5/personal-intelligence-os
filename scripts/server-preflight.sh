#!/usr/bin/env bash
# Read-only inventory. Does not install packages or change server settings.
set -u
printf 'PIOS server preflight (read-only)\nUser: '; id -un
printf 'OS: '; uname -sr
for tool in java node docker psql nginx; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '%s: installed\n' "$tool"
  else
    printf '%s: not found\n' "$tool"
  fi
done
if command -v java >/dev/null 2>&1; then java -version 2>&1 | head -n 1; fi
if command -v node >/dev/null 2>&1; then node --version; fi
if command -v docker >/dev/null 2>&1; then
  if docker info --format '{{.ServerVersion}}' 2>/dev/null; then
    docker compose version --short 2>/dev/null || true
  else
    printf 'Docker daemon is unavailable or this account lacks permission.\n'
  fi
fi
printf '\nRequirements: Java 21 runtime in Docker, Compose v2, PostgreSQL 16 + pgvector,\nprivate persistent storage, allowed long-running processes and an operator-managed HTTPS proxy.\n'
printf 'An installed psql client does not prove a pgvector database exists.\nDo not assume the shared host dashboard resources are your account allocation.\n'
