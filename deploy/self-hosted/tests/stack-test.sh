#!/usr/bin/env bash
# Stack test for the self-hosted deployment: runs the real Compose stack under its own project name
# (rechnungen-test) on ports 8080/8443 and leaves the developer's local Supabase and dev server alone.
#
# Usage: stack-test.sh setup | backup | e2e | lint | all
#   e2e [lint]  Playwright main flow against https://<host>:8443, then (if given) the Supabase security lint, on ONE fresh stack
#   all         setup, backup, then "e2e lint" - three fresh stacks one after another, each torn down before the next
# KEEP=1 leaves the stack running afterwards (the temp env file path is printed).
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$TESTS_DIR")"
SCRIPTS_DIR="$DEPLOY_DIR/scripts"

TEST_PROJECT=rechnungen-test
TEST_HOST=rechnungen.localhost
TEST_HTTP_PORT=8080
TEST_HTTPS_PORT=8443
TEST_EMAIL=owner@stack-test.localhost
TEST_PASSWORD='stack-test-password-1'
TEST_TENANT='Stack Test GmbH'

TMP_DIR="$(mktemp -d)"
export ENV_FILE="$TMP_DIR/stack.env"
FAILURES=0

compose() { docker compose --project-directory "$DEPLOY_DIR" --env-file "$ENV_FILE" -p "$TEST_PROJECT" "$@"; }

cleanup() {
  local code=$?
  if [ "${KEEP:-0}" = 1 ]; then
    echo "KEEP=1: stack left running (ENV_FILE=$ENV_FILE)"
    return "$code"
  fi
  if [ -f "$ENV_FILE" ]; then
    compose down -v --rmi local --remove-orphans >/dev/null 2>&1 || true
  else
    docker compose -p "$TEST_PROJECT" down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_DIR:?}"
  return "$code"
}
trap cleanup EXIT

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILURES=$((FAILURES + 1)); }

check() { # check <description> <command...>
  local description=$1
  shift
  if "$@"; then pass "$description"; else fail "$description"; fi
}

port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

require_free_ports() {
  local port
  for port in "$TEST_HTTP_PORT" "$TEST_HTTPS_PORT"; do
    if port_in_use "$port"; then
      echo "port $port is already in use; stop whatever listens there and retry" >&2
      exit 2
    fi
  done
}

https_get() { # https_get <path> [curl args...] -> prints "<status>" or headers when -D is given
  local path=$1
  shift
  curl -ksS --resolve "$TEST_HOST:$TEST_HTTPS_PORT:127.0.0.1" -o /dev/null "$@" "https://$TEST_HOST:$TEST_HTTPS_PORT$path"
}

# Password login through the internal gateway (not published), executed inside the caddy container.
password_login() { # password_login <email> <password> -> response body (empty on HTTP error)
  compose exec -T caddy wget -qO- --header 'Content-Type: application/json' \
    --post-data "{\"email\":\"$1\",\"password\":\"$2\"}" 'http://localhost:8000/auth/v1/token?grant_type=password' 2>/dev/null || true
}

login_page_ok() {
  local status headers
  headers="$TMP_DIR/headers"
  status="$(https_get /login -D "$headers" -w '%{http_code}')"
  [ "$status" = 200 ] && grep -qi '^content-security-policy:.*nonce-' "$headers"
}

wait_for_login_page() {
  for _ in $(seq 1 30); do
    if login_page_ok; then return 0; fi
    sleep 2
  done
  return 1
}

quietly() { "$@" >/dev/null 2>&1; }

cert_exported() {
  (cd "$TMP_DIR" && bash "$SCRIPTS_DIR/cert" >/dev/null 2>&1) && grep -q 'BEGIN CERTIFICATE' "$TMP_DIR/rechnungen-root.crt"
}

refused_without_env() { # refused_without_env <env file> <setup output>
  [ ! -e "$1" ] && grep -q 'APP_HOST may only contain' <<<"$2"
}

has_no_token() { ! grep -q '"access_token"' <<<"$1"; }

published_ports_only_test_ports() {
  local ports
  ports="$(docker ps --filter "label=com.docker.compose.project=$TEST_PROJECT" --format '{{.Ports}}' | grep -oE ':[0-9]+->' | tr -d ':>-' | sort -u | tr '\n' ' ')"
  echo "  published host ports: $ports"
  [ "$ports" = "$TEST_HTTP_PORT $TEST_HTTPS_PORT " ]
}

# Starts the stack through scripts/setup; the age key pair stays in the temp directory (backup tests need the private key).
run_setup() {
  require_free_ports
  local age_recipient
  age-keygen -o "$TMP_DIR/age.key" >/dev/null 2>&1
  age_recipient="$(age-keygen -y "$TMP_DIR/age.key")"
  echo "== running setup"
  AGE_RECIPIENT="$age_recipient" APP_HOST="$TEST_HOST" HTTP_PORT="$TEST_HTTP_PORT" HTTPS_PORT="$TEST_HTTPS_PORT" \
    COMPOSE_PROJECT_NAME="$TEST_PROJECT" OWNER_EMAIL="$TEST_EMAIL" OWNER_PASSWORD="$TEST_PASSWORD" TENANT_NAME="$TEST_TENANT" \
    bash "$SCRIPTS_DIR/setup"
}

cmd_setup() {
  run_setup

  echo "== checks"
  check "(a) HTTPS /login returns 200 with a nonce CSP" login_page_ok

  local body
  body="$(password_login "$TEST_EMAIL" "$TEST_PASSWORD")"
  check "(b) password login through the gateway returns an access token" grep -q '"access_token"' <<<"$body"

  local status
  status="$(https_get /passwort-vergessen -w '%{http_code}')"
  check "(c) /passwort-vergessen returns 404 (got $status)" test "$status" = 404

  local out
  out="$(ENV_FILE="$ENV_FILE" bash "$SCRIPTS_DIR/migrate")"
  echo "  migrate: $out"
  check "(d) second migrate applies nothing" grep -q '^0 applied' <<<"$out"

  check "(e) only the test ports are published" published_ports_only_test_ports

  compose restart >/dev/null 2>&1
  check "(f) /login works again after a full restart" wait_for_login_page

  echo "== sign-up and password rules"
  local anon_key signup_out users
  anon_key="$(sed -n 's/^ANON_KEY=//p' "$ENV_FILE")"
  signup_out="$(compose exec -T caddy wget -S -O- --header 'Content-Type: application/json' --header "apikey: $anon_key" \
    --post-data '{"email":"intruder@stack-test.localhost","password":"intruder-password-12"}' http://localhost:8000/auth/v1/signup 2>&1 || true)"
  echo "  sign-up response: $(grep -oE 'HTTP/[0-9.]+ [0-9]+.*' <<<"$signup_out" | head -n 1)"
  check "(k) sign-up through the gateway is rejected with a 4xx" grep -qE 'HTTP/[0-9.]+ 4[0-9][0-9]' <<<"$signup_out"
  users="$(compose exec -T db psql -U postgres -qtA -c 'select count(*) from auth.users' | tr -d '[:space:]')"
  check "(k) the rejected sign-up created no account (users: $users)" test "$users" = 1

  echo "== set-password"
  local err
  if err="$(NEW_PASSWORD='short-11-ch' bash "$SCRIPTS_DIR/set-password" "$TEST_EMAIL" 2>&1)"; then
    fail "(g) set-password rejects an 11-character password"
  else
    check "(g) set-password refuses with the length message (got: $err)" grep -q 'at least 12 characters' <<<"$err"
  fi
  body="$(password_login "$TEST_EMAIL" "$TEST_PASSWORD")"
  check "(g) rejected change left the old password valid" grep -q '"access_token"' <<<"$body"
  # Same rule one layer down: the database function rejects short passwords even when the script check is bypassed.
  if err="$(compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -qtA -c "select private.set_password('$TEST_EMAIL', 'short-11-ch')" 2>&1)"; then
    fail "(g2) the database function rejects an 11-character password"
  else
    check "(g2) the database function rejects an 11-character password" grep -q 'at least 12 characters' <<<"$err"
  fi
  body="$(password_login "$TEST_EMAIL" "$TEST_PASSWORD")"
  check "(g2) old password still valid after the direct attempt" grep -q '"access_token"' <<<"$body"

  local new_password='another-valid-password-2'
  NEW_PASSWORD="$new_password" bash "$SCRIPTS_DIR/set-password" "$TEST_EMAIL" >/dev/null
  body="$(password_login "$TEST_EMAIL" "$TEST_PASSWORD")"
  check "(h) old password no longer logs in" has_no_token "$body"
  body="$(password_login "$TEST_EMAIL" "$new_password")"
  check "(h) new password logs in" grep -q '"access_token"' <<<"$body"

  echo "== setup input validation"
  sed 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=/' "$ENV_FILE" >"$TMP_DIR/partial.env"
  err="$(ENV_FILE="$TMP_DIR/partial.env" bash "$SCRIPTS_DIR/setup" 2>&1 || true)"
  check "(l) setup refuses an existing .env with an empty secret" grep -q 'incomplete (empty or missing: POSTGRES_PASSWORD)' <<<"$err"
  err="$(ENV_FILE="$TMP_DIR/never-written.env" APP_HOST='bad host' AGE_RECIPIENT=age1abc bash "$SCRIPTS_DIR/setup" 2>&1 || true)"
  check "(m) setup refuses an APP_HOST with a space and writes no .env" refused_without_env "$TMP_DIR/never-written.env" "$err"

  echo "== status and cert"
  check "(i) status runs" quietly bash "$SCRIPTS_DIR/status"
  check "(j) cert exports the root certificate" cert_exported
}

# ---- backup / restore / update ----

psql_test() { compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@" | tr -d '\r'; }

access_token() { # access_token <email> <password>
  password_login "$1" "$2" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}

# Binary upload through the internal gateway, like the app does (user token, <tenant>/logo-*.png in the assets bucket).
storage_upload() { # storage_upload <token> <object path> <local file>
  compose exec -T caddy sh -c 'cat > /tmp/upload.bin' <"$3"
  compose exec -T caddy wget -qO- --header "Authorization: Bearer $1" --header 'Content-Type: image/png' \
    --post-file=/tmp/upload.bin "http://localhost:8000/storage/v1/object/assets/$2" 2>&1
}

storage_download() { # storage_download <token> <object path> <local file>
  compose exec -T caddy wget -qO- --header "Authorization: Bearer $1" \
    "http://localhost:8000/storage/v1/object/authenticated/assets/$2" >"$3"
}

# Prints a date N days ago as YYYY-MM-DD (GNU or BSD date).
days_ago() {
  date -u -d "$1 days ago" +%Y-%m-%d 2>/dev/null || date -u -v-"$1"d +%Y-%m-%d
}

backup_files() { find "$1" -maxdepth 1 -name 'rechnungen-[0-9]*.tar.age' | sort; }
safety_files() { find "$1" -maxdepth 1 -name 'rechnungen-safety-*.tar.age' | sort; }

archive_lists() { # archive_lists <file>: the decrypted archive holds the expected entries
  local listing
  listing="$(age -d -i "$TMP_DIR/age.key" "$1" | tar -tf -)"
  echo "  archive entries: $(tr '\n' ' ' <<<"$listing")"
  grep -qE '(^|/)data\.sql$' <<<"$listing" && grep -qE '(^|/)storage\.tar$' <<<"$listing" \
    && grep -qE '(^|/)caddy\.tar$' <<<"$listing" && grep -qE '(^|/)\.env$' <<<"$listing" \
    && grep -qE '(^|/)migrations\.txt$' <<<"$listing" && grep -qE '(^|/)commit\.txt$' <<<"$listing"
}

archive_member() { age -d -i "$TMP_DIR/age.key" "$1" | tar -xOf - "$2"; } # archive_member <file> <member>

# True when the migration list stored in the archive equals the versions of the files in the repository.
archive_manifest_matches_repo() {
  local listed expected
  listed="$(archive_member "$1" migrations.txt)"
  expected="$(for f in "$REPO_DIR"/supabase/migrations/*.sql; do basename "$f" | cut -d_ -f1; done | sort)"
  [ -n "$listed" ] && [ "$listed" = "$expected" ]
}

# True when the archive's commit.txt holds a git commit hash (or "unknown" outside a git checkout).
archive_has_commit() { grep -qE '^([0-9a-f]{40}|unknown)$' <<<"$(archive_member "$1" commit.txt)"; }

archive_has_env_secret() { # archive_has_env_secret <file>: the encrypted file must not leak the database password in clear text
  local password
  password="$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ENV_FILE")"
  ! grep -qF "$password" "$1"
}

cmd_backup() {
  run_setup
  local backups="$TMP_DIR/backups" tenant token logo
  mkdir -p "$backups"
  sed -i.bak "s|^BACKUP_DIR=.*|BACKUP_DIR=$backups|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"

  echo "== test data"
  tenant="$(psql_test -c 'select id from public.tenants limit 1')"
  psql_test -c "insert into public.customers (tenant_id, name, city) values ('$tenant', 'Backup Kunde', 'Passau')" >/dev/null
  token="$(access_token "$TEST_EMAIL" "$TEST_PASSWORD")"
  logo="$TMP_DIR/logo.png"
  # Text-safe content: busybox wget cuts --post-file bodies at the first NUL byte; the storage layer does not care about the bytes.
  head -c 3000 /dev/urandom | base64 >"$logo"
  storage_upload "$token" "$tenant/logo-1.png" "$logo" | head -c 200
  echo
  storage_download "$token" "$tenant/logo-1.png" "$TMP_DIR/logo.before"
  check "(n) test logo uploaded through the storage API" cmp -s "$logo" "$TMP_DIR/logo.before"
  (cd "$TMP_DIR" && bash "$SCRIPTS_DIR/cert" >/dev/null 2>&1)
  cp "$TMP_DIR/rechnungen-root.crt" "$TMP_DIR/root-before.crt"

  echo "== backup"
  bash "$SCRIPTS_DIR/backup"
  local archive
  archive="$(backup_files "$backups" | tail -n 1)"
  check "(o) backup wrote an archive named rechnungen-YYYY-MM-DD-HHMM.tar.age" grep -qE 'rechnungen-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}\.tar\.age$' <<<"$archive"
  check "(o) archive holds data.sql, storage.tar, caddy.tar, .env, migrations.txt and commit.txt" archive_lists "$archive"
  check "(o) migrations.txt lists exactly the applied migrations of the repository" archive_manifest_matches_repo "$archive"
  check "(o) commit.txt holds the git commit" archive_has_commit "$archive"
  check "(o) archive does not contain the database password in clear text" archive_has_env_secret "$archive"
  check "(o) storage.tar contains the uploaded logo" bash -c "age -d -i '$TMP_DIR/age.key' '$archive' | tar -xOf - storage.tar 2>/dev/null | tar -tf - | grep -q 'logo-1.png'"
  check "(o) no work files are left in the backup directory" test "$(find "$backups" -type f | wc -l | tr -d ' ')" = 1
  # A failed run still touches the lock file; status must keep naming the last finished archive, not the lock or a .partial file.
  touch "$backups/.backup.lock" "$backups/.partial.test"
  check "(o) status names the newest archive, not the lock or a partial file" bash -c "ENV_FILE='$ENV_FILE' bash '$SCRIPTS_DIR/status' | grep -qF '$(basename "$archive")'"
  check "(o) status does not name the lock or partial file" bash -c "! ENV_FILE='$ENV_FILE' bash '$SCRIPTS_DIR/status' | grep -qE '\.backup\.lock|\.partial'"
  rm -f "$backups/.partial.test" "$backups/.backup.lock"

  echo "== backup failure"
  sed "s|^AGE_RECIPIENT=.*|AGE_RECIPIENT=age1notakey|" "$ENV_FILE" >"$TMP_DIR/bad-recipient.env"
  local before after
  before="$(backup_files "$backups" | wc -l | tr -d ' ')"
  if ENV_FILE="$TMP_DIR/bad-recipient.env" bash "$SCRIPTS_DIR/backup" >"$TMP_DIR/bad-backup.log" 2>&1; then
    fail "(p) backup with an invalid age recipient exits non-zero"
  else
    pass "(p) backup with an invalid age recipient exits non-zero"
  fi
  after="$(find "$backups" -type f | wc -l | tr -d ' ')"
  check "(p) failed backup leaves no partial file ($before -> $after)" test "$before" = "$after"

  echo "== retention"
  local retention="$TMP_DIR/retention" i
  mkdir -p "$retention"
  # 20 daily files ending 3 days ago, plus one file per month for 15 older months, plus a stranger that must survive.
  for i in $(seq 3 22); do
    : >"$retention/rechnungen-$(days_ago "$i")-0315.tar.age"
  done
  for i in $(seq 1 15); do
    : >"$retention/rechnungen-$(days_ago $((i * 31 + 20)))-0315.tar.age"
  done
  : >"$retention/notes-do-not-delete.txt"
  sed "s|^BACKUP_DIR=.*|BACKUP_DIR=$retention|" "$ENV_FILE" >"$TMP_DIR/retention.env"
  ENV_FILE="$TMP_DIR/retention.env" bash "$SCRIPTS_DIR/backup" >/dev/null
  local kept
  kept="$(backup_files "$retention" | wc -l | tr -d ' ')"
  echo "  kept $kept backup files"
  check "(q) the stranger file survives" test -f "$retention/notes-do-not-delete.txt"
  check "(q) the 14 newest files are kept (new backup + the 13 newest dummies)" test -f "$retention/rechnungen-$(days_ago 3)-0315.tar.age" \
    -a -f "$retention/rechnungen-$(days_ago 15)-0315.tar.age"
  check "(q) file from 16 days ago is gone unless it is the newest of its month" retention_oldest_daily_pruned "$retention"
  check "(q) no more than 14 + 12 monthly files remain" test "$kept" -le 26
  check "(q) nothing older than 12 months remains" retention_nothing_ancient "$retention"

  echo "== backup keeps its own file, refuses a wrong clock, serializes runs"
  local protect="$TMP_DIR/protect" today hhmm minute
  mkdir -p "$protect"
  today="$(date +%Y-%m-%d)"
  hhmm="$(date +%H%M)"
  if [ "$hhmm" -ge 2345 ]; then
    echo "  skipped (the dummy names need the clock to be before 23:45)"
  else
    # 15 files from later today: the new backup sorts as the oldest one, is not the newest of its month, and sits behind 15 others.
    for minute in $(seq 45 59); do : >"$protect/rechnungen-$today-23$minute.tar.age"; done
    sed "s|^BACKUP_DIR=.*|BACKUP_DIR=$protect|" "$ENV_FILE" >"$TMP_DIR/protect.env"
    ENV_FILE="$TMP_DIR/protect.env" bash "$SCRIPTS_DIR/backup" >/dev/null
    check "(v) the backup just written survives pruning although it sorts as the oldest ($(backup_files "$protect" | wc -l | tr -d ' ') files)" \
      test "$(find "$protect" -maxdepth 1 -name "rechnungen-$today-*.tar.age" -size +0 | wc -l | tr -d ' ')" = 1
  fi
  mkdir -p "$TMP_DIR/fakeclock"
  printf '#!/bin/sh\ncase "$*" in "+%%Y") echo 1970 ;; *) exec /bin/date "$@" ;; esac\n' >"$TMP_DIR/fakeclock/date"
  chmod +x "$TMP_DIR/fakeclock/date"
  before="$(backup_files "$backups" | wc -l | tr -d ' ')"
  if PATH="$TMP_DIR/fakeclock:$PATH" bash "$SCRIPTS_DIR/backup" >"$TMP_DIR/clock.log" 2>&1; then
    fail "(w) backup refuses to run with the clock in 1970"
  else
    check "(w) backup refuses to run with the clock in 1970 and says why" grep -q 'clock' "$TMP_DIR/clock.log"
  fi
  check "(w) the refused run wrote nothing" test "$(backup_files "$backups" | wc -l | tr -d ' ')" = "$before"

  local conc="$TMP_DIR/conc" pid_list="" pid holder
  mkdir -p "$conc"
  sed "s|^BACKUP_DIR=.*|BACKUP_DIR=$conc|" "$ENV_FILE" >"$TMP_DIR/conc.env"
  for i in 1 2 3; do
    ENV_FILE="$TMP_DIR/conc.env" bash "$SCRIPTS_DIR/backup" >"$TMP_DIR/conc-$i.log" 2>&1 &
    pid_list="$pid_list $!"
  done
  local all_ok=1
  for pid in $pid_list; do wait "$pid" || all_ok=0; done
  check "(x) three overlapping backups all succeed" test "$all_ok" = 1
  check "(x) they produced three distinct, complete archives and no leftovers" bash -c "
    test \"\$(find '$conc' -maxdepth 1 -name 'rechnungen-*.tar.age' | wc -l | tr -d ' ')\" = 3 &&
    test \"\$(find '$conc' -maxdepth 1 -name '.partial*' | wc -l | tr -d ' ')\" = 0 &&
    for f in '$conc'/rechnungen-*.tar.age; do age -d -i '$TMP_DIR/age.key' \"\$f\" | tar -tf - | grep -q data.sql || exit 1; done"
  # A held lock makes the next backup give up with a clear message after BACKUP_LOCK_TIMEOUT seconds.
  if command -v flock >/dev/null 2>&1; then
    (
      exec 9>"$conc/.backup.lock"
      flock 9
      sleep 20
    ) &
    holder=$!
  else
    mkdir "$conc/.backup.lock.d"
    echo $$ >"$conc/.backup.lock.d/pid"
    holder=""
  fi
  sleep 1
  if ENV_FILE="$TMP_DIR/conc.env" BACKUP_LOCK_TIMEOUT=2 bash "$SCRIPTS_DIR/backup" >"$TMP_DIR/locked.log" 2>&1; then
    fail "(y) a backup gives up while another one holds the lock"
  else
    check "(y) a backup gives up while another one holds the lock, with a clear message" grep -q 'another backup' "$TMP_DIR/locked.log"
  fi
  if [ -n "$holder" ]; then kill "$holder" 2>/dev/null || true; wait "$holder" 2>/dev/null || true; else rm -rf "$conc/.backup.lock.d"; fi
  check "(y) after the lock is released a backup works again" bash -c "ENV_FILE='$TMP_DIR/conc.env' bash '$SCRIPTS_DIR/backup' >/dev/null"

  echo "== restore"
  psql_test -c "delete from public.customers where name = 'Backup Kunde'" >/dev/null
  psql_test -c "insert into public.customers (tenant_id, name) values ('$tenant', 'Added after backup')" >/dev/null
  if AGE_IDENTITY="$TMP_DIR/age.key" bash "$SCRIPTS_DIR/restore" --yes "$TMP_DIR/does-not-exist.tar.age" >/dev/null 2>&1; then
    fail "(r) restore of a missing file fails"
  else
    pass "(r) restore of a missing file fails"
  fi
  check "(r) failed restore left the data untouched" test "$(psql_test -c "select count(*) from public.customers where name = 'Added after backup'")" = 1
  echo "== restore failing half way"
  # An archive whose database part is broken passes the unpack check but fails the load, after the old data has been deleted.
  # The crafted archive has the format of the first script version (no migration list); it also proves that such archives still work.
  # It lives in a crowded backup directory, as the oldest file: the safety backup that restore makes must neither prune the
  # directory nor delete the file being restored.
  local craft="$TMP_DIR/craft" crowded="$TMP_DIR/crowded" bad_archive bad_out safety_file
  mkdir -p "$craft" "$crowded"
  bad_archive="$crowded/rechnungen-$(days_ago 25)-0315.tar.age"
  age -d -i "$TMP_DIR/age.key" "$archive" | tar -x -C "$craft" data.sql storage.tar caddy.tar .env
  echo 'this is not valid sql;' >"$craft/data.sql"
  tar -C "$craft" -cf - data.sql storage.tar caddy.tar .env | age -r "$(age-keygen -y "$TMP_DIR/age.key")" >"$bad_archive"
  for i in $(seq 3 22); do : >"$crowded/rechnungen-$(days_ago "$i")-0315.tar.age"; done
  sed -i.bak "s|^BACKUP_DIR=.*|BACKUP_DIR=$crowded|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  if bad_out="$(AGE_IDENTITY="$TMP_DIR/age.key" bash "$SCRIPTS_DIR/restore" --yes "$bad_archive" 2>&1)"; then
    fail "(z) restore with a broken data.sql exits non-zero"
  else
    pass "(z) restore with a broken data.sql exits non-zero"
  fi
  tail -n 8 <<<"$bad_out" | sed 's/^/  | /'
  check "(z) it says the restore is incomplete and how to continue" grep -q 'RESTORE INCOMPLETE' <<<"$bad_out"
  check "(z) it names the same backup file for the second attempt" grep -qF "restore $bad_archive" <<<"$bad_out"
  safety_file="$(sed -n 's/^The data this machine had before the restore is saved in: //p' <<<"$bad_out")"
  check "(z) it names the safety backup" test -f "$safety_file"
  check "(z) the safety backup holds the data from before the restore" bash -c "age -d -i '$TMP_DIR/age.key' '$safety_file' | tar -xOf - data.sql | grep -q 'Added after backup'"
  check "(z) old-format archive (no migration list) is accepted with a warning" grep -q 'has no migration list' <<<"$bad_out"
  check "(ab) the safety file has its own name pattern (rechnungen-safety-...)" grep -qE '/rechnungen-safety-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}\.tar\.age$' <<<"$safety_file"
  check "(ab) the safety backup pruned nothing: all 20 old files and the file being restored are still there" \
    test "$(find "$crowded" -maxdepth 1 -name 'rechnungen-[0-9]*.tar.age' | wc -l | tr -d ' ')" = 21
  sed "s|^BACKUP_DIR=.*|BACKUP_DIR=$crowded|" "$ENV_FILE" >"$TMP_DIR/crowded.env"
  ENV_FILE="$TMP_DIR/crowded.env" bash "$SCRIPTS_DIR/status" >"$TMP_DIR/crowded-status.log"
  check "(ab) status: 'newest backup' is a regular one, not the safety copy" \
    bash -c "awk '/^== newest backup/ { getline; print; exit }' '$TMP_DIR/crowded-status.log' | grep -qE 'rechnungen-[0-9]{4}-' && ! awk '/^== newest backup/ { getline; print; exit }' '$TMP_DIR/crowded-status.log' | grep -q safety"
  check "(ab) status lists the safety copy separately" bash -c "sed -n '/^== safety copies/,\$p' '$TMP_DIR/crowded-status.log' | grep -qF '$(basename "$safety_file")'"

  echo "== restore (second attempt with the good data, old archive format)"
  # The failed attempt left an empty, freshly migrated database behind: there is nothing to save, so no safety backup is made.
  local legacy="$TMP_DIR/legacy.tar.age" second_out
  rm -rf "$craft" && mkdir -p "$craft"
  age -d -i "$TMP_DIR/age.key" "$archive" | tar -x -C "$craft" data.sql storage.tar caddy.tar .env
  tar -C "$craft" -cf - data.sql storage.tar caddy.tar .env | age -r "$(age-keygen -y "$TMP_DIR/age.key")" >"$legacy"
  second_out="$(AGE_IDENTITY="$TMP_DIR/age.key" bash "$SCRIPTS_DIR/restore" --yes "$legacy" 2>&1)" || { echo "$second_out"; fail "(s) second restore attempt succeeds"; }
  tail -n 5 <<<"$second_out" | sed 's/^/  | /'
  check "(ab) no safety backup is made when the database has no accounts" grep -q 'has no accounts; skipping the safety backup' <<<"$second_out"
  check "(ab) the skipped safety backup left no file behind" test "$(safety_files "$backups" | wc -l | tr -d ' ')" = 0
  check "(s) restored: the customer from the backup is back" test "$(psql_test -c "select count(*) from public.customers where name = 'Backup Kunde'")" = 1
  check "(s) restored: the customer added later is gone" test "$(psql_test -c "select count(*) from public.customers where name = 'Added after backup'")" = 0
  check "(s) restored: exactly one account and one business" test "$(psql_test -c 'select (select count(*) from auth.users)::text || (select count(*) from public.tenants)::text')" = 11
  wait_for_login_page || true
  token="$(access_token "$TEST_EMAIL" "$TEST_PASSWORD")"
  check "(s) restored: login with the old password works" test -n "$token"
  check "(s) restored: HTTPS login page is served" login_page_ok
  storage_download "$token" "$tenant/logo-1.png" "$TMP_DIR/logo.after" || true
  check "(s) restored: the logo downloads with identical bytes through the storage API" cmp -s "$logo" "$TMP_DIR/logo.after"
  (cd "$TMP_DIR" && bash "$SCRIPTS_DIR/cert" >/dev/null 2>&1)
  check "(s) restored: Caddy's root certificate is unchanged" cmp -s "$TMP_DIR/root-before.crt" "$TMP_DIR/rechnungen-root.crt"
  check "(s) restored: migrations are all applied (nothing left)" grep -q '^0 applied' <(bash "$SCRIPTS_DIR/migrate")

  echo "== restore of a backup from an older schema (migration list, migrate --until)"
  # A copy of the migrations with one extra file stands in for "the checkout is newer than the backup". The file renames a
  # column (the old data.sql would no longer fit if it ran before the load) and backfills a column from the restored rows
  # (a backfill that ran before the load would see an empty table). The repository's own migrations are never touched.
  local mig_dir="$TMP_DIR/migrations" extra_version=20990101000000 older_archive newer_archive refuse_out out env_backups_before
  cp -R "$REPO_DIR/supabase/migrations" "$mig_dir"
  cat >"$mig_dir/${extra_version}_test_rename_and_backfill.sql" <<'SQL'
alter table public.customers rename column city to town;
alter table public.customers add column marker text;
update public.customers set marker = 'backfilled:' || name;
SQL
  bash "$SCRIPTS_DIR/backup" >/dev/null
  older_archive="$(backup_files "$backups" | tail -n 1)"
  psql_test -c "delete from public.customers where name = 'Backup Kunde'" >/dev/null
  psql_test -c "insert into public.customers (tenant_id, name) values ('$tenant', 'Added after older backup')" >/dev/null
  out="$(MIGRATIONS_DIR="$mig_dir" AGE_IDENTITY="$TMP_DIR/age.key" bash "$SCRIPTS_DIR/restore" --yes "$older_archive" 2>&1)" || { echo "$out"; fail "(ac) restore of the older backup succeeds"; }
  tail -n 6 <<<"$out" | sed 's/^/  | /'
  check "(ac) the customer from the backup is back, the later one is gone" test \
    "$(psql_test -c "select count(*) filter (where name = 'Backup Kunde')::text || count(*) filter (where name = 'Added after older backup')::text from public.customers")" = 10
  check "(ac) the newer migration ran after the load: column renamed" test \
    "$(psql_test -c "select count(*) filter (where column_name = 'town')::text || count(*) filter (where column_name = 'city')::text from information_schema.columns where table_schema = 'public' and table_name = 'customers'")" = 10
  check "(ac) the newer migration saw the restored rows (backfill applied)" test \
    "$(psql_test -c "select marker from public.customers where name = 'Backup Kunde'")" = "backfilled:Backup Kunde"
  check "(ac) the data was loaded before the newer migration was applied" bash -c "
    load=\$(grep -n 'Loading the database' <<<\"\$1\" | head -n 1 | cut -d: -f1); applied=\$(grep -n 'applying ${extra_version}' <<<\"\$1\" | head -n 1 | cut -d: -f1)
    [ -n \"\$load\" ] && [ -n \"\$applied\" ] && [ \"\$load\" -lt \"\$applied\" ]" _ "$out"
  check "(ac) nothing is left to migrate afterwards" grep -q '^0 applied' <(MIGRATIONS_DIR="$mig_dir" bash "$SCRIPTS_DIR/migrate")
  wait_for_login_page || true
  check "(ac) login works after the restore" test -n "$(access_token "$TEST_EMAIL" "$TEST_PASSWORD")"
  check "(ab) a regular restore makes exactly one safety backup (accounts existed)" test "$(safety_files "$backups" | wc -l | tr -d ' ')" = 1

  echo "== restore of a backup that is newer than the checkout is refused"
  # This backup lists the extra migration; the plain repository does not have it.
  bash "$SCRIPTS_DIR/backup" >/dev/null
  newer_archive="$(backup_files "$backups" | tail -n 1)"
  psql_test -c "insert into public.customers (tenant_id, name) values ('$tenant', 'Must survive the refusal')" >/dev/null
  env_backups_before="$(find "$TMP_DIR" -maxdepth 1 -name 'stack.env.bak-*' | wc -l | tr -d ' ')"
  if refuse_out="$(AGE_IDENTITY="$TMP_DIR/age.key" bash "$SCRIPTS_DIR/restore" --yes "$newer_archive" 2>&1)"; then
    fail "(ad) restore of a newer backup is refused"
  else
    pass "(ad) restore of a newer backup is refused"
  fi
  tail -n 3 <<<"$refuse_out" | sed 's/^/  | /'
  check "(ad) the message names the unknown migration and says to check out a newer version" bash -c "grep -q '$extra_version' <<<\"\$1\" && grep -q 'newer version' <<<\"\$1\"" _ "$refuse_out"
  check "(ad) nothing was destroyed: no 'incomplete' notice, stack not stopped" bash -c "! grep -qE 'RESTORE INCOMPLETE|Stopping the current stack' <<<\"\$1\"" _ "$refuse_out"
  check "(ad) the .env was not moved away" test "$(find "$TMP_DIR" -maxdepth 1 -name 'stack.env.bak-*' | wc -l | tr -d ' ')" = "$env_backups_before"
  check "(ad) the current data is still there" test "$(psql_test -c "select count(*) from public.customers where name = 'Must survive the refusal'")" = 1
  check "(ad) the app still serves the login page" login_page_ok
  check "(ad) no safety backup was made for the refused restore" test "$(safety_files "$backups" | wc -l | tr -d ' ')" = 1

  echo "== update"
  if ENV_FILE="$TMP_DIR/bad-recipient.env" bash "$SCRIPTS_DIR/update" --no-pull >"$TMP_DIR/bad-update.log" 2>&1; then
    fail "(t) update stops when the backup fails"
  else
    check "(t) update stops when the backup fails (no migration or build ran)" bash -c "! grep -qE 'applying|0 applied|Building' '$TMP_DIR/bad-update.log'"
  fi
  touch "$TMP_DIR/update-marker"
  # An untagged ("dangling") image stands in for the previous app image; update must remove it and nothing that is in use.
  local dangling_id containers_before volumes_before
  dangling_id="$(printf 'FROM scratch\nLABEL stack-test-dangling=%s\n' "$RANDOM$RANDOM" | docker build -q - 2>/dev/null || true)"
  check "(ae) a dangling test image exists before the update" bash -c "docker image inspect '$dangling_id' >/dev/null 2>&1"
  containers_before="$(docker ps -q --filter "label=com.docker.compose.project=$TEST_PROJECT" | wc -l | tr -d ' ')"
  volumes_before="$(docker volume ls -q --filter "label=com.docker.compose.project=$TEST_PROJECT" | sort | tr '\n' ' ')"
  out="$(bash "$SCRIPTS_DIR/update" --no-pull 2>&1)" || { echo "$out"; fail "(u) update --no-pull succeeds"; }
  echo "$out" | tail -n 6
  check "(ae) update removed the dangling image" bash -c "! docker image inspect '$dangling_id' >/dev/null 2>&1"
  check "(ae) update printed the clean-up step" grep -q 'Removing old images and build cache' <<<"$out"
  check "(ae) every container of the stack still runs ($containers_before)" test \
    "$(docker ps -q --filter "label=com.docker.compose.project=$TEST_PROJECT" | wc -l | tr -d ' ')" = "$containers_before"
  check "(ae) no volume was removed" test "$(docker volume ls -q --filter "label=com.docker.compose.project=$TEST_PROJECT" | sort | tr '\n' ' ')" = "$volumes_before"
  check "(u) update made a backup first" test -n "$(find "$backups" -maxdepth 1 -name 'rechnungen-*.tar.age' -newer "$TMP_DIR/update-marker")"
  check "(u) update leaves a working app" wait_for_login_page
  token="$(access_token "$TEST_EMAIL" "$TEST_PASSWORD")"
  check "(u) login works after update" test -n "$token"

  echo "== update with a failing build"
  local app_before app_after override="$TMP_DIR/broken-build.yml"
  printf 'FROM caddy:2.11.7-alpine\nRUN exit 1\n' >"$TMP_DIR/Dockerfile.broken"
  printf 'services:\n  app:\n    build:\n      dockerfile: %s\n' "$TMP_DIR/Dockerfile.broken" >"$override"
  app_before="$(compose ps -q app)"
  if out="$(COMPOSE_FILE="$DEPLOY_DIR/compose.yml:$override" bash "$SCRIPTS_DIR/update" --no-pull 2>&1)"; then
    fail "(aa) update with a failing build exits non-zero"
  else
    pass "(aa) update with a failing build exits non-zero"
  fi
  tail -n 4 <<<"$out" | sed 's/^/  | /'
  app_after="$(compose ps -q app)"
  check "(aa) the running app container is the same one" test -n "$app_before" -a "$app_before" = "$app_after"
  check "(aa) the migrations did not run (the build failed first)" bash -c "! grep -q 'Applying database migrations' <<<\"\$1\"" _ "$out"
  check "(aa) the old app still serves the login page" login_page_ok
}

retention_oldest_daily_pruned() { # day 16..22 daily files must be gone unless they are the newest file of an older month
  local dir=$1 i name month other newest
  for i in 16 18 20 22; do
    name="rechnungen-$(days_ago "$i")-0315.tar.age"
    [ -f "$dir/$name" ] || continue
    # Still there: only allowed when it is the newest file of its month.
    month="${name:11:7}"
    newest="$(find "$dir" -maxdepth 1 -name "rechnungen-$month-*.tar.age" | sort | tail -n 1)"
    other="$dir/$name"
    [ "$newest" = "$other" ] || return 1
  done
  return 0
}

retention_nothing_ancient() {
  local dir=$1 cutoff
  cutoff="$(days_ago 400)"
  ! backup_files "$dir" | sed 's|.*/rechnungen-||' | awk -v c="$cutoff" 'substr($0, 1, 10) < c { found = 1 } END { exit !found }'
}

# ---- end-to-end test and security lint ----

REPO_DIR="$(dirname "$(dirname "$DEPLOY_DIR")")"

# Pinned Supabase security lint ("splinter", Postgres advisors). The repository ships no license file, so the SQL is not
# vendored: it is downloaded at test time from a fixed commit and checked against a SHA-256 before it runs.
SPLINTER_COMMIT=fccca4b1c4d8b48b8ccd69bd6b30e84adcb92975
SPLINTER_URL="https://raw.githubusercontent.com/supabase/splinter/$SPLINTER_COMMIT/splinter.sql"
SPLINTER_SHA256=d8d558baad3e03832e521c527907fa50a9a172fabd899dd0f5c2504a5a0e9349

run_e2e() {
  echo "== end-to-end test (Playwright, https://$TEST_HOST:$TEST_HTTPS_PORT)"
  wait_for_login_page || { fail "(e2e) the login page does not come up"; return; }
  if (cd "$REPO_DIR" && E2E_BASE_URL="https://$TEST_HOST:$TEST_HTTPS_PORT" E2E_EMAIL="$TEST_EMAIL" E2E_PASSWORD="$TEST_PASSWORD" npx playwright test); then
    pass "(e2e) main flow and password-reset-disabled test"
  else
    fail "(e2e) Playwright run"
  fi
}

lint_clean() { ! grep -qE '^(ERROR|WARN)' <<<"$1"; }

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# Runs the downloaded lint as the postgres role against the test database and prints every row it returns.
# ERROR and WARN rows fail the check; INFO rows are printed for the record.
run_lint() {
  echo "== security lint (supabase/splinter @ ${SPLINTER_COMMIT:0:12})"
  local sql="$TMP_DIR/splinter.sql" actual rows line
  if ! curl -fsSL --max-time 60 -o "$sql" "$SPLINTER_URL"; then
    fail "(lint) could not download $SPLINTER_URL"
    return
  fi
  actual="$(sha256_of "$sql")"
  if [ "$actual" != "$SPLINTER_SHA256" ]; then
    fail "(lint) splinter.sql checksum mismatch (got $actual)"
    return
  fi
  # The lint sets session state with "set local"/set_config(..., true): both need an open transaction.
  # The result goes into a temp table so that the columns can be picked and ordered here.
  if ! rows="$({
    echo 'begin;'
    awk '!done && $0 == "(" { print "create temp table splinter_result as ("; done = 1; next } { print }' "$sql"
    echo ';'
    echo "select level || ' | ' || name || ' | ' || coalesce(cache_key, '') from splinter_result order by level, name, cache_key;"
    echo 'commit;'
  } | psql_test)"; then
    fail "(lint) the lint query failed"
    return
  fi
  if [ -z "$rows" ]; then
    echo "  (the lint returned no rows)"
  else
    echo "  rows (level | lint | object):"
    while IFS= read -r line; do echo "    $line"; done <<<"$rows"
  fi
  check "(lint) no ERROR or WARN findings" lint_clean "$rows"
}

cmd_app_checks() { # cmd_app_checks e2e|lint...: one stack for all requested parts
  local part
  run_setup
  for part in "$@"; do
    case "$part" in
      e2e) run_e2e ;;
      lint) run_lint ;;
      *) echo "unknown part: $part" >&2; exit 64 ;;
    esac
  done
}

case "${1:-}" in
  setup) cmd_setup ;;
  backup) cmd_backup ;;
  e2e | lint) cmd_app_checks "$@" ;;
  all)
    # Separate processes: every part owns its stack, temp directory and cleanup trap.
    for part in "setup" "backup" "e2e lint"; do
      echo "======== stack-test.sh $part"
      # shellcheck disable=SC2086 # $part is one or two words on purpose
      bash "${BASH_SOURCE[0]}" $part || exit $?
    done
    exit 0
    ;;
  *)
    echo "usage: $0 setup|backup|e2e|lint|all" >&2
    exit 64
    ;;
esac

if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES check(s) failed"
  exit 1
fi
echo "all checks passed"
