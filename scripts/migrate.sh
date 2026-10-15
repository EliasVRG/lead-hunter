#!/usr/bin/env bash
# Aplica init.sql e, em seguida, cada migration em ordem numérica.
#
# Todas as migrations são idempotentes (IF NOT EXISTS / DROP ... IF EXISTS), então
# rodar de novo é seguro e não existe tabela de controle de versão de schema.
#
# Usa o psql do host quando existe; senão, canaliza cada arquivo para o psql do
# container via stdin. As duas vias aplicam o mesmo conjunto de arquivos.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a

DB_NAME="${DB_NAME:-leads}"
DB_USER="${DB_USER:-lead}"

sql_files() {
  echo packages/database/init.sql
  # Ordem numérica: 0002 antes de 0010. `sort -V` evita a ordem lexicográfica.
  find packages/database/migrations -name '*.sql' | sort -V
}

if command -v psql >/dev/null 2>&1; then
  DB_HOST="${DB_HOST:-localhost}"
  DB_PORT="${DB_PORT:-5442}"
  export PGPASSWORD="${DB_PASSWORD:-lead}"

  apply() {
    psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
      --no-psqlrc --quiet --set ON_ERROR_STOP=1 --file="$1"
  }
else
  echo "psql não encontrado no host; usando o psql do container"

  if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
  else
    echo "ERRO: nem psql no host nem plugin 'docker compose' (v2)." >&2
    echo "      Instale um dos dois: sudo apt install postgresql-client" >&2
    echo "                        ou sudo apt install docker-compose-v2" >&2
    exit 1
  fi

  apply() {
    $COMPOSE exec -T postgres \
      psql --username="$DB_USER" --dbname="$DB_NAME" \
        --no-psqlrc --quiet --set ON_ERROR_STOP=1 < "$1"
  }
fi

while read -r file; do
  echo "==> $file"
  apply "$file"
done < <(sql_files)

echo "==> migrations aplicadas"
