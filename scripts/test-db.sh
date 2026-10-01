#!/usr/bin/env bash
# Kjører databasetestene i supabase/tests/ mot lokal Supabase (npx supabase db start).
# Seed kjøres først; den er idempotent, så det gjør ikke noe om den allerede er lastet.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
cd "$(dirname "$0")/.."
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/seed.sql
for f in supabase/tests/*.sql; do
  echo "== $f"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -o /dev/null -f "$f"
done
echo "Alle databasetester gikk gjennom."
