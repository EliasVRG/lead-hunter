#!/usr/bin/env bash
# Aplica init.sql e, em seguida, cada migration em ordem numérica.
#
# Todas as migrations são idempotentes (IF NOT EXISTS / DROP ... IF EXISTS), então
# rodar de novo é seguro e não existe tabela de controle de versão de schema.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5442}"
DB_NAME="${DB_NAME:-leads}"
DB_USER="${DB_USER:-lead}"
DB_PASSWORD="${DB_PASSWORD:-lead}"

export PGPASSWORD="$DB_PASSWORD"

run_sql_file() {
  echo "==> $1"
  psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
    --no-psqlrc --quiet --set ON_ERROR_STOP=1 --file="$1"
}

if ! command -v psql >/dev/null 2>&1; then
  echo "psql não encontrado no host; usando o container do compose" >&2
  exec docker compose exec -T postgres sh -c '
    for f in /docker-entrypoint-initdb.d/init.sql; do psql -U lead -d leads -v ON_ERROR_STOP=1 -f "$f"; done
  '
fi

run_sql_file packages/database/init.sql

for migration in packages/database/migrations/*.sql; do
  run_sql_file "$migration"
done

echo "==> migrations aplicadas"
