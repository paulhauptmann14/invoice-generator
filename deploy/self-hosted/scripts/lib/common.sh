#!/usr/bin/env bash
# Shared helpers for the self-hosted scripts. Source it; it does not run anything by itself.

# shellcheck disable=SC2034 # DEPLOY_DIR and REPO_DIR are used by the scripts that source this file
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_DIR="$(cd "$DEPLOY_DIR/../.." && pwd)"
# Tests point ENV_FILE at a temporary file.
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
# Tests point MIGRATIONS_DIR at a copy that has an extra file.
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$REPO_DIR/supabase/migrations}"
# The systemd unit rechnungen-backup-failed.service touches this file when the nightly backup fails; a successful regular
# backup removes it and status reports it. It lives next to the scripts, not in the backup directory (that disk may be missing).
# shellcheck disable=SC2034 # used by backup and status
BACKUP_FAILED_MARKER="${BACKUP_FAILED_MARKER:-$DEPLOY_DIR/.backup-failed}"

die() {
  echo "error: $*" >&2
  exit 1
}

info() {
  echo "$*"
}

compose() {
  docker compose --project-directory "$DEPLOY_DIR" --env-file "$ENV_FILE" "$@"
}

# Reads a value from the env file without sourcing it.
env_get() { # env_get <KEY> [default]
  local value=""
  if [ -f "$ENV_FILE" ]; then
    value="$(sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1)"
  fi
  echo "${value:-${2:-}}"
}

# True unless .env says BACKUPS=off. A .env without the key (made before the switch existed) counts as on, so installations
# that already had backups keep them. Manual `backup` ignores this; the timer honours it. update and restore do not depend on it:
# they always make a safety copy of their own (see backup --pre-update and --safety).
backups_enabled() {
  [ "$(env_get BACKUPS on)" != off ]
}

# Validates a value for one of the .env keys that restore may override (same rules as setup). Dies with a message otherwise.
check_env_value() { # check_env_value <KEY> <value>
  local key=$1 value=$2
  case "$key" in
    APP_HOST) [[ "$value" =~ ^[A-Za-z0-9.-]+$ ]] || die "APP_HOST may only contain letters, digits, dots and hyphens" ;;
    HTTP_PORT | HTTPS_PORT) [[ "$value" =~ ^[0-9]+$ ]] || die "$key must be a number" ;;
    BACKUPS) [[ "$value" = on || "$value" = off ]] || die "BACKUPS must be 'on' or 'off'" ;;
    REGISTRATION) [[ "$value" = on || "$value" = off ]] || die "REGISTRATION must be 'on' or 'off'" ;;
    AGE_RECIPIENT)
      [ -z "$value" ] || [[ "$value" =~ ^age1[a-z0-9]+$ ]] || die "AGE_RECIPIENT must be an age public key starting with age1 (or empty for unencrypted backups)"
      ;;
    BACKUP_DIR) [[ "$value" != *$'\n'* ]] || die "BACKUP_DIR must be a single line" ;;
  esac
}

# Sets KEY=value in an env file (replaces the line or appends it). The file keeps its mode.
set_env_value() { # set_env_value <file> <KEY> <value>
  local file=$1 key=$2 value=$3 tmp
  tmp="$(umask 077 && mktemp "$file.XXXXXX")"
  grep -v "^$key=" "$file" >"$tmp" || true
  printf '%s=%s\n' "$key" "$value" >>"$tmp"
  mv "$tmp" "$file"
}

# Runs psql as the database owner inside the db container; the script comes from stdin.
# Secrets must not travel in arguments (visible in the process list): export them and list their names in
# PSQL_PASS_ENV, then read them in the script with \getenv and use them as :'variable'.
psql_admin() {
  # Notices ("already exists, skipping") would only add noise to the script output.
  local args=(-e 'PGOPTIONS=-c client_min_messages=warning') name
  for name in ${PSQL_PASS_ENV:-}; do
    args+=(-e "$name")
  done
  compose exec -T "${args[@]}" db psql -U postgres -v ON_ERROR_STOP=1 "$@"
}

# Asks for a password twice without echo. A value already present in the environment variable named by $1
# (used by tests and unattended runs) is taken as is. Exports the variable.
read_password() { # read_password <VARNAME> <prompt>
  local name=$1 prompt=$2 first second
  if [ -n "${!name:-}" ]; then
    first="${!name}"
  else
    [ -t 0 ] || die "no terminal to ask for the password; set $name in the environment"
    read -r -s -p "$prompt: " first
    echo
    read -r -s -p "Repeat the password: " second
    echo
    [ "$first" = "$second" ] || die "the passwords do not match; nothing was changed"
  fi
  [ "${#first}" -ge 12 ] || die "the password needs at least 12 characters; nothing was changed"
  printf -v "$name" '%s' "$first"
  export "${name?}"
}

# Absolute backup directory (BACKUP_DIR may be relative to the deploy directory).
backup_dir() {
  local dir
  dir="$(env_get BACKUP_DIR ./backups)"
  case "$dir" in
    /*) echo "$dir" ;;
    *) echo "$DEPLOY_DIR/${dir#./}" ;;
  esac
}

# Tables of the four application schemas, without migration bookkeeping (the migrations create it on every machine). Backup and
# restore both use these queries. The database owner cannot write a few tables of the storage API's unused vector feature; those
# are left out of backups (they hold no data here) and are not truncated by restore.
DATA_TABLES_SQL="select format('%I.%I', schemaname, tablename) from pg_tables
  where schemaname in ('public', 'private', 'auth', 'storage')
    and (schemaname, tablename) not in (('auth', 'schema_migrations'), ('storage', 'migrations'))"
WRITABLE_TABLES_SQL="$DATA_TABLES_SQL
    and has_table_privilege(format('%I.%I', schemaname, tablename), 'INSERT')
    and has_table_privilege(format('%I.%I', schemaname, tablename), 'TRUNCATE')"

# Docker volume of the running project for a logical name from compose.yml (e.g. storage-data). Compose prefixes the project name.
volume_name() { # volume_name <logical name>
  local name
  name="$(docker volume ls -q --filter "label=com.docker.compose.project=$(env_get COMPOSE_PROJECT_NAME)" \
    --filter "label=com.docker.compose.volume=$1" | head -n 1)"
  [ -n "$name" ] || die "Docker volume '$1' of this stack does not exist (is the stack set up?)"
  echo "$name"
}

# The small image used to read and write volumes: the Caddy image the stack already uses (no extra download).
tools_image() {
  local image
  image="$(compose config --images | grep '^caddy:' | head -n 1)"
  [ -n "$image" ] || die "could not determine the Caddy image from compose.yml"
  echo "$image"
}

# Writes the content of a volume as a tar stream to stdout (numeric owners and permissions preserved).
volume_to_tar() { # volume_to_tar <logical name>
  docker run --rm --network none -v "$(volume_name "$1"):/src:ro" --entrypoint tar "$(tools_image)" -C /src --numeric-owner -cpf - .
}

# Replaces the content of a volume with the tar stream on stdin.
tar_to_volume() { # tar_to_volume <logical name>
  docker run --rm -i --network none -v "$(volume_name "$1"):/dst" --entrypoint sh "$(tools_image)" \
    -c 'find /dst -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -C /dst --numeric-owner -xpf -'
}

# Waits until every listed service reports a healthy container.
wait_healthy() { # wait_healthy <service>...
  local service id state deadline=$((SECONDS + ${HEALTH_TIMEOUT:-300}))
  for service in "$@"; do
    while true; do
      id="$(compose ps -q "$service" | head -n 1)"
      state=""
      if [ -n "$id" ]; then
        state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
      fi
      [ "$state" = healthy ] && break
      if [ "$SECONDS" -ge "$deadline" ]; then
        compose logs --tail 30 "$service" >&2 || true
        die "service '$service' did not become healthy (state: ${state:-missing})"
      fi
      sleep 2
    done
  done
}
