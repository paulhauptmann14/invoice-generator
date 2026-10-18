#!/usr/bin/env bash
# Stack test for the self-hosted deployment: runs the real Compose stack under its own project name
# (rechnungen-test) on ports 8080/8443 and leaves the developer's local Supabase and dev server alone.
#
# Usage: stack-test.sh setup | backup | e2e | lint | all
#   e2e [lint]  Playwright main flow against https://<host>:8443, then (if given) the Supabase security lint, on ONE fresh stack
#   all         setup, backup, then "e2e lint" - three fresh stacks one after another, each torn down before the next
# The setup and e2e parts install with the new-install default REGISTRATION=on (the account is created through sign-up, setup asks for
# none); the setup part later switches registration off to check the closed state. The backup part uses REGISTRATION=off, so
# setup creates the owner account itself (private.bootstrap_owner) - that covers the bootstrap path.
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
# "nokey" leaves AGE_RECIPIENT out of the environment (setup does not ask for it; new installs have no key). Setup then writes
# BACKUPS=off; the backup tests switch it on in their env file.
# "register" is a new install with the default REGISTRATION=on (no owner account, no business; people sign up in the browser).
# Without it the install uses REGISTRATION=off and setup creates the owner account and the business (bootstrap path).
run_setup() { # run_setup [nokey] [register]
  require_free_ports
  local envs=(APP_HOST="$TEST_HOST" HTTP_PORT="$TEST_HTTP_PORT" HTTPS_PORT="$TEST_HTTPS_PORT" COMPOSE_PROJECT_NAME="$TEST_PROJECT")
  local unset_args=() nokey=0 register=0 arg
  for arg in "$@"; do
    case "$arg" in
      nokey) nokey=1 ;;
      register) register=1 ;;
    esac
  done
  if [ "$register" = 1 ]; then
    unset_args+=(-u REGISTRATION -u OWNER_EMAIL -u OWNER_PASSWORD -u TENANT_NAME)
  else
    envs+=(REGISTRATION=off OWNER_EMAIL="$TEST_EMAIL" OWNER_PASSWORD="$TEST_PASSWORD" TENANT_NAME="$TEST_TENANT")
  fi
  if [ "$nokey" = 1 ]; then
    unset_args+=(-u AGE_RECIPIENT)
  else
    age-keygen -o "$TMP_DIR/age.key" >/dev/null 2>&1
    envs+=(AGE_RECIPIENT="$(age-keygen -y "$TMP_DIR/age.key")")
  fi
  echo "== running setup${*:+ ($*)}"
  env ${unset_args[@]+"${unset_args[@]}"} "${envs[@]}" bash "$SCRIPTS_DIR/setup" </dev/null 2>&1 | tee "$TMP_DIR/setup.out"
  return "${PIPESTATUS[0]}"
}

# Sign-up through the internal gateway (not published). Prints the response with headers; the status line is the first one.
gateway_signup() { # gateway_signup <email> <password>
  compose exec -T caddy wget -S -O- --header 'Content-Type: application/json' --header "apikey: $(sed -n 's/^ANON_KEY=//p' "$ENV_FILE")" \
    --post-data "{\"email\":\"$1\",\"password\":\"$2\"}" http://localhost:8000/auth/v1/signup 2>&1 || true
}

signup_status() { grep -oE 'HTTP/[0-9.]+ [0-9]+' <<<"$1" | head -n 1 | grep -oE '[0-9]+$' || true; }

# Writes REGISTRATION=<on|off> to the test .env and recreates the services that read it (app and auth).
switch_registration() { # switch_registration on|off
  sed -i.bak "s|^REGISTRATION=.*|REGISTRATION=$1|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  compose up -d --force-recreate auth app >/dev/null 2>&1
  compose up -d --wait auth app >/dev/null 2>&1 || true
  wait_for_login_page
}

# Fetches the login page into $TMP_DIR/login.html; succeeds when it links to the registration.
login_page_has_signup_link() {
  curl -ksS --resolve "$TEST_HOST:$TEST_HTTPS_PORT:127.0.0.1" -o "$TMP_DIR/login.html" "https://$TEST_HOST:$TEST_HTTPS_PORT/login"
  grep -q 'Konto anlegen' "$TMP_DIR/login.html"
}

login_page_without_signup_link() { ! login_page_has_signup_link; }

cmd_setup() {
  # The setup part runs with an empty AGE_RECIPIENT (the key is optional) and the new-install default REGISTRATION=on.
  run_setup nokey register

  echo "== registration is on after a fresh setup"
  check "(an) a new install writes REGISTRATION=on" grep -qx 'REGISTRATION=on' "$ENV_FILE"
  check "(an) setup asked for no account and points to 'Konto anlegen'" grep -q "choose 'Konto anlegen'" "$TMP_DIR/setup.out"
  check "(an) setup created no account (users: $(compose exec -T db psql -U postgres -qtA -c 'select count(*) from auth.users' | tr -d '[:space:]'))" \
    test "$(compose exec -T db psql -U postgres -qtA -c 'select count(*) from auth.users' | tr -d '[:space:]')" = 0
  local status signup_out
  status="$(https_get /registrieren -w '%{http_code}')"
  check "(an) /registrieren returns 200 (got $status)" test "$status" = 200
  check "(an) the login page offers 'Konto anlegen'" login_page_has_signup_link
  signup_out="$(gateway_signup "$TEST_EMAIL" "$TEST_PASSWORD")"
  check "(an) sign-up through the gateway succeeds with a session (status $(signup_status "$signup_out"))" grep -q '"access_token"' <<<"$signup_out"
  signup_out="$(gateway_signup "$TEST_EMAIL" "$TEST_PASSWORD")"
  check "(an) a second sign-up with the same address is rejected (status $(signup_status "$signup_out"))" grep -qE 'HTTP/[0-9.]+ 4[0-9][0-9]' <<<"$signup_out"
  # The business of the new account: created by the account itself (RLS applies), like the welcome page does.
  local token
  token="$(password_login "$TEST_EMAIL" "$TEST_PASSWORD" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
  signup_out="$(compose exec -T caddy wget -qO- --header 'Content-Type: application/json' --header "apikey: $(sed -n 's/^ANON_KEY=//p' "$ENV_FILE")" \
    --header "Authorization: Bearer $token" --post-data "{\"p_name\":\"$TEST_TENANT\"}" http://localhost:8000/rest/v1/rpc/create_tenant 2>&1 || true)"
  check "(an) the new account can create its business through the API" grep -qE '^"[0-9a-f-]{36}"$' <<<"$signup_out"

  echo "== checks"
  check "(a) HTTPS /login returns 200 with a nonce CSP" login_page_ok

  local body
  body="$(password_login "$TEST_EMAIL" "$TEST_PASSWORD")"
  check "(b) password login through the gateway returns an access token" grep -q '"access_token"' <<<"$body"

  status="$(https_get /passwort-vergessen -w '%{http_code}')"
  check "(c) /passwort-vergessen returns 404 (got $status)" test "$status" = 404

  local out
  out="$(ENV_FILE="$ENV_FILE" bash "$SCRIPTS_DIR/migrate")"
  echo "  migrate: $out"
  check "(d) second migrate applies nothing" grep -q '^0 applied' <<<"$out"

  check "(e) only the test ports are published" published_ports_only_test_ports

  compose restart >/dev/null 2>&1
  check "(f) /login works again after a full restart" wait_for_login_page

  echo "== registration off: sign-up and password rules"
  local users
  switch_registration off || fail "(k) the stack comes up with REGISTRATION=off"
  signup_out="$(gateway_signup "intruder@stack-test.localhost" "intruder-password-12")"
  echo "  sign-up response: $(grep -oE 'HTTP/[0-9.]+ [0-9]+.*' <<<"$signup_out" | head -n 1)"
  check "(k) sign-up through the gateway is rejected with a 4xx" grep -qE 'HTTP/[0-9.]+ 4[0-9][0-9]' <<<"$signup_out"
  users="$(compose exec -T db psql -U postgres -qtA -c 'select count(*) from auth.users' | tr -d '[:space:]')"
  check "(k) the rejected sign-up created no account (users: $users)" test "$users" = 1
  status="$(https_get /registrieren -w '%{http_code}')"
  check "(k) /registrieren returns 404 (got $status)" test "$status" = 404
  check "(k) the login page has no 'Konto anlegen' link" login_page_without_signup_link
  check "(k) the login page still works" login_page_ok
  switch_registration on || fail "(an) the stack comes up with REGISTRATION=on again"
  check "(an) switching REGISTRATION back to on reopens sign-up (login link)" login_page_has_signup_link
  switch_registration off || fail "(k) the stack comes up with REGISTRATION=off again"
  check "(k) switching it off again removes the 'Konto anlegen' link" login_page_without_signup_link

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
  sed 's/^REGISTRATION=.*/REGISTRATION=maybe/' "$ENV_FILE" >"$TMP_DIR/bad-registration.env"
  err="$(ENV_FILE="$TMP_DIR/bad-registration.env" bash "$SCRIPTS_DIR/setup" 2>&1 </dev/null || true)"
  check "(an) setup refuses an existing .env with REGISTRATION other than on/off" grep -q "REGISTRATION must be 'on' or 'off'" <<<"$err"
  err="$(ENV_FILE="$TMP_DIR/never-written-3.env" APP_HOST=rechnungen.localhost REGISTRATION=sometimes bash "$SCRIPTS_DIR/setup" 2>&1 </dev/null || true)"
  check "(an) setup refuses REGISTRATION=sometimes in the environment and writes no .env" bash -c "[ ! -e '$TMP_DIR/never-written-3.env' ] && grep -q \"REGISTRATION must be\" <<<\"\$1\"" _ "$err"
  err="$(ENV_FILE="$TMP_DIR/never-written.env" APP_HOST='bad host' AGE_RECIPIENT=age1abc bash "$SCRIPTS_DIR/setup" 2>&1 || true)"
  check "(m) setup refuses an APP_HOST with a space and writes no .env" refused_without_env "$TMP_DIR/never-written.env" "$err"

  echo "== optional backup key"
  check "(af) setup with an empty AGE_RECIPIENT wrote the line AGE_RECIPIENT= (empty) to .env" grep -qx 'AGE_RECIPIENT=' "$ENV_FILE"
  grep -v '^AGE_RECIPIENT=' "$ENV_FILE" >"$TMP_DIR/no-key-line.env"
  err="$(ENV_FILE="$TMP_DIR/no-key-line.env" bash "$SCRIPTS_DIR/setup" 2>&1 || true)"
  check "(af) setup refuses an existing .env without the AGE_RECIPIENT line" grep -q 'incomplete (empty or missing: AGE_RECIPIENT)' <<<"$err"
  err="$(ENV_FILE="$TMP_DIR/never-written-2.env" APP_HOST=rechnungen.localhost AGE_RECIPIENT=notakey bash "$SCRIPTS_DIR/setup" 2>&1 </dev/null || true)"
  check "(af) setup still rejects a non-empty AGE_RECIPIENT that is not an age key, and writes no .env" \
    bash -c "[ ! -e '$TMP_DIR/never-written-2.env' ] && grep -q 'AGE_RECIPIENT must be' <<<\"\$1\"" _ "$err"
  # Re-running setup on the existing .env with the empty key keeps the .env and works.
  err="$(bash "$SCRIPTS_DIR/setup" </dev/null 2>&1)" || { echo "$err" | tail -n 5; fail "(af) re-running setup with an empty AGE_RECIPIENT succeeds"; }
  check "(af) the re-run kept the existing .env" grep -q 'Keeping the existing' <<<"$err"

  echo "== status and cert"
  check "(i) status runs" quietly bash "$SCRIPTS_DIR/status"
  check "(j) cert exports the root certificate" cert_exported

  echo "== backups are off by default"
  check "(al) a new install has BACKUPS=off and an empty AGE_RECIPIENT, and setup did not ask for a key" \
    bash -c "grep -qx 'BACKUPS=off' '$ENV_FILE' && grep -qx 'AGE_RECIPIENT=' '$ENV_FILE'"
  sed 's/^BACKUPS=.*/BACKUPS=maybe/' "$ENV_FILE" >"$TMP_DIR/bad-backups.env"
  err="$(ENV_FILE="$TMP_DIR/bad-backups.env" bash "$SCRIPTS_DIR/setup" 2>&1 </dev/null || true)"
  check "(al) setup refuses an existing .env with BACKUPS other than on/off" grep -q "BACKUPS must be 'on' or 'off'" <<<"$err"
  local off_dir="$TMP_DIR/off-backups" rc=0 off_files tenant off_archive
  sed -i.bak "s|^BACKUP_DIR=.*|BACKUP_DIR=$off_dir|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  err="$(bash "$SCRIPTS_DIR/status" 2>&1)"
  check "(al) status: the first line says 'Backups: OFF' and points to the README" bash -c "head -n 1 <<<\"\$1\" | grep -q '^Backups: OFF (enable: see README .Turn on backups.)\$'" _ "$err"
  err="$(bash "$SCRIPTS_DIR/backup" --if-enabled 2>&1)" || rc=$?
  check "(al) backup --if-enabled does nothing and exits 0 while backups are off" test "$rc" = 0 -a -z "$(find "$off_dir" -type f 2>/dev/null)"
  check "(al) it says so in one line" test "$(grep -c 'Backups are off' <<<"$err")" = 1
  tenant="$(psql_test -c 'select id from public.tenants limit 1')"
  psql_test -c "insert into public.customers (tenant_id, name) values ('$tenant', 'Off Kunde')" >/dev/null
  err="$(bash "$SCRIPTS_DIR/backup" 2>&1)" || { echo "$err"; fail "(al) a manual backup works while backups are off"; }
  off_archive="$(find "$off_dir" -maxdepth 1 -type f -name 'rechnungen-[0-9]*.tar' | sort | tail -n 1)"
  check "(al) a manual backup still works while backups are off (rechnungen-....tar)" test -s "$off_archive"
  err="$(bash "$SCRIPTS_DIR/status" 2>&1)"
  check "(al) status still lists the existing backup while backups are off" grep -qF "$(basename "$off_archive")" <<<"$err"
  err="$(bash "$SCRIPTS_DIR/update" --no-pull 2>&1)" || { echo "$err" | tail -n 8; fail "(al) update --no-pull succeeds while backups are off"; }
  check "(al) update says it continues without a backup" grep -qi 'backups are off - updating without a backup' <<<"$err"
  off_files="$(find "$off_dir" -type f ! -name .backup.lock | wc -l | tr -d ' ')"
  check "(al) update made no backup" test "$off_files" = 1
  check "(al) the app serves the login page after the update" wait_for_login_page
  psql_test -c "delete from public.customers where name = 'Off Kunde'" >/dev/null
  psql_test -c "insert into public.customers (tenant_id, name) values ('$tenant', 'Added after off backup')" >/dev/null
  err="$(env -u AGE_IDENTITY bash "$SCRIPTS_DIR/restore" --yes "$off_archive" 2>&1 </dev/null)" || { echo "$err" | tail -n 12; fail "(al) restore succeeds while backups are off"; }
  check "(al) restore says it skips the safety backup because backups are off" grep -q 'Backups are off - restoring without a safety backup' <<<"$err"
  check "(al) the notice comes BEFORE the destructive step (and so before any confirmation)" bash -c "
    notice=\$(grep -n 'Backups are off - restoring without a safety backup' <<<\"\$1\" | head -n 1 | cut -d: -f1); stop=\$(grep -n 'Stopping the current stack' <<<\"\$1\" | head -n 1 | cut -d: -f1)
    [ -n \"\$notice\" ] && [ -n \"\$stop\" ] && [ \"\$notice\" -lt \"\$stop\" ]" _ "$err"
  check "(al) restore made no safety backup" bash -c "! grep -q 'Making a safety backup' <<<\"\$1\" && [ -z \"\$(find '$off_dir' -name 'rechnungen-safety-*')\" ]" _ "$err"
  check "(al) restored: the customer from the backup is back, the later one is gone" test \
    "$(psql_test -c "select count(*) filter (where name = 'Off Kunde')::text || count(*) filter (where name = 'Added after off backup')::text from public.customers")" = 10
  check "(ao) the systemd service runs the backup with --if-enabled" grep -qE '^ExecStart=.*/scripts/backup --if-enabled$' "$DEPLOY_DIR/systemd/rechnungen-backup.service"
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

# The tar stream of a backup: decrypted for .tar.age, as is for .tar.
archive_stream() { case "$1" in *.age) age -d -i "$TMP_DIR/age.key" "$1" ;; *) cat "$1" ;; esac; }

file_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }

# Regular backups of both kinds (not the safety copies).
all_backup_files() { find "$1" -maxdepth 1 -type f \( -name 'rechnungen-[0-9]*.tar.age' -o -name 'rechnungen-[0-9]*.tar' \) | sort; }

archive_lists() { # archive_lists <file>: the decrypted archive holds the expected entries
  local listing
  listing="$(archive_stream "$1" | tar -tf -)"
  echo "  archive entries: $(tr '\n' ' ' <<<"$listing")"
  grep -qE '(^|/)data\.sql$' <<<"$listing" && grep -qE '(^|/)storage\.tar$' <<<"$listing" \
    && grep -qE '(^|/)caddy\.tar$' <<<"$listing" && grep -qE '(^|/)\.env$' <<<"$listing" \
    && grep -qE '(^|/)migrations\.txt$' <<<"$listing" && grep -qE '(^|/)commit\.txt$' <<<"$listing"
}

archive_member() { archive_stream "$1" | tar -xOf - "$2"; } # archive_member <file> <member>

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
  # Setup wrote BACKUPS=off; the backup checks run with backups on.
  sed -i.bak -e "s|^BACKUP_DIR=.*|BACKUP_DIR=$backups|" -e 's|^BACKUPS=.*|BACKUPS=on|' "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  check "(am) the test env has BACKUPS=on" grep -qx 'BACKUPS=on' "$ENV_FILE"

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

  echo "== backups on: legacy .env without a BACKUPS line counts as on"
  mkdir -p "$TMP_DIR/legacy-backups"
  grep -v '^BACKUPS=' "$ENV_FILE" | sed "s|^BACKUP_DIR=.*|BACKUP_DIR=$TMP_DIR/legacy-backups|" >"$TMP_DIR/legacy.env"
  ENV_FILE="$TMP_DIR/legacy.env" bash "$SCRIPTS_DIR/backup" --if-enabled >/dev/null 2>&1 || true
  check "(am) backup --if-enabled makes a backup when the .env has no BACKUPS line" test "$(find "$TMP_DIR/legacy-backups" -name 'rechnungen-[0-9]*.tar.age' -size +0 | wc -l | tr -d ' ')" = 1
  ENV_FILE="$TMP_DIR/legacy.env" bash "$SCRIPTS_DIR/status" >"$TMP_DIR/status-legacy.log"
  check "(am) status says 'Backups: on' for it" bash -c "head -n 1 '$TMP_DIR/status-legacy.log' | grep -q '^Backups: on\$'"

  echo "== status shows whether the newest backup is encrypted"
  ENV_FILE="$ENV_FILE" bash "$SCRIPTS_DIR/status" >"$TMP_DIR/status-key.log"
  check "(ag) status: the newest backup line ends with '- encrypted' (key set)" \
    bash -c "awk '/^== newest backup/ { getline; print; exit }' '$TMP_DIR/status-key.log' | grep -qE 'tar\.age \(.*\) - encrypted\$'"
  check "(ag) status: says that AGE_RECIPIENT is set" grep -q 'AGE_RECIPIENT is set' "$TMP_DIR/status-key.log"

  echo "== unencrypted backups (empty AGE_RECIPIENT)"
  local plain="$TMP_DIR/plain" plain_archive plain_out plain_restore_out plain_logo="$TMP_DIR/logo2.png" fakeage="$TMP_DIR/fakeage"
  mkdir -p "$plain" "$fakeage"
  # An "age" that records every call and fails: nothing in the unencrypted path may run it.
  printf '#!/bin/sh\necho called >>"%s/age-called"\nexit 99\n' "$TMP_DIR" >"$fakeage/age"
  chmod +x "$fakeage/age"
  sed -e 's|^AGE_RECIPIENT=.*|AGE_RECIPIENT=|' -e "s|^BACKUP_DIR=.*|BACKUP_DIR=$plain|" "$ENV_FILE" >"$TMP_DIR/nokey.env"
  check "(ah) the test env has an empty AGE_RECIPIENT line" grep -qx 'AGE_RECIPIENT=' "$TMP_DIR/nokey.env"
  psql_test -c "insert into public.customers (tenant_id, name) values ('$tenant', 'Plain Kunde')" >/dev/null
  token="$(access_token "$TEST_EMAIL" "$TEST_PASSWORD")"
  head -c 3000 /dev/urandom | base64 >"$plain_logo"
  storage_upload "$token" "$tenant/logo-2.png" "$plain_logo" >/dev/null
  plain_out="$(ENV_FILE="$TMP_DIR/nokey.env" PATH="$fakeage:$PATH" bash "$SCRIPTS_DIR/backup" 2>&1)" || { echo "$plain_out"; fail "(ah) backup with an empty AGE_RECIPIENT succeeds"; }
  printf '%s\n' "$plain_out" | sed 's/^/  | /'
  plain_archive="$(find "$plain" -maxdepth 1 -type f -name 'rechnungen-[0-9]*.tar' | sort | tail -n 1)"
  check "(ah) backup wrote rechnungen-YYYY-MM-DD-HHMM.tar (no .age)" grep -qE '/rechnungen-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}\.tar$' <<<"$plain_archive"
  check "(ah) the unencrypted archive is mode 600" test "$(file_mode "$plain_archive")" = 600
  check "(ah) it holds data.sql, storage.tar, caddy.tar, .env, migrations.txt and commit.txt" archive_lists "$plain_archive"
  check "(ah) its migrations.txt lists exactly the applied migrations" archive_manifest_matches_repo "$plain_archive"
  check "(ah) its data.sql holds the customer" bash -c "tar -xOf '$plain_archive' data.sql | grep -q 'Plain Kunde'"
  check "(ah) its storage.tar holds the second logo" bash -c "tar -xOf '$plain_archive' storage.tar | tar -tf - | grep -q 'logo-2.png'"
  check "(ah) a one-line warning says the backup is NOT encrypted" test "$(grep -c 'NOT encrypted' <<<"$plain_out")" = 1
  check "(ah) the warning says the directory is outside this installation and to set AGE_RECIPIENT first" bash -c "grep 'NOT encrypted' <<<\"\$1\" | grep -q 'outside this installation.*set AGE_RECIPIENT'" _ "$plain_out"
  # A backup directory below the deploy directory (the default) gets the shorter warning.
  local inside_out
  inside_out="$(sed "s|^BACKUP_DIR=.*|BACKUP_DIR=./.stack-test-backups|" "$TMP_DIR/nokey.env" >"$TMP_DIR/inside.env"; ENV_FILE="$TMP_DIR/inside.env" PATH="$fakeage:$PATH" bash "$SCRIPTS_DIR/backup" 2>&1)" \
    || fail "(ah) backup into a directory below the deploy directory succeeds"
  rm -rf "${DEPLOY_DIR:?}/.stack-test-backups"
  check "(ah) inside the deploy directory the warning is the short one (no 'outside')" bash -c "grep 'NOT encrypted' <<<\"\$1\" | grep -qv 'outside this installation'" _ "$inside_out"
  check "(ah) the age program was never called" test ! -e "$TMP_DIR/age-called"
  check "(ah) no work files are left in the backup directory" test "$(find "$plain" -type f ! -name .backup.lock | wc -l | tr -d ' ')" = 1
  ENV_FILE="$TMP_DIR/nokey.env" bash "$SCRIPTS_DIR/status" >"$TMP_DIR/status-nokey.log"
  check "(ai) status: the newest backup line names the .tar and ends with '- NOT encrypted'" \
    bash -c "awk '/^== newest backup/ { getline; print; exit }' '$TMP_DIR/status-nokey.log' | grep -qE '$(basename "$plain_archive") \(.*\) - NOT encrypted\$'"
  check "(ai) status: says that AGE_RECIPIENT is empty" grep -q 'AGE_RECIPIENT is empty' "$TMP_DIR/status-nokey.log"

  echo "== retention counts .tar and .tar.age together"
  local mixed="$TMP_DIR/mixed" ext
  mkdir -p "$mixed"
  for i in $(seq 3 22); do
    if [ $((i % 2)) = 0 ]; then ext=tar; else ext=tar.age; fi
    : >"$mixed/rechnungen-$(days_ago "$i")-0315.$ext"
  done
  for i in $(seq 1 15); do
    if [ $((i % 2)) = 0 ]; then ext=tar; else ext=tar.age; fi
    : >"$mixed/rechnungen-$(days_ago $((i * 31 + 20)))-0315.$ext"
  done
  # Never touched: a foreign file, a look-alike with another extension and the safety copies of both kinds (all very old).
  : >"$mixed/notes-do-not-delete.txt"
  : >"$mixed/rechnungen-2020-01-01-0000.tar.gz"
  : >"$mixed/rechnungen-safety-2020-01-01-0000.tar"
  : >"$mixed/rechnungen-safety-2020-01-01-0001.tar.age"
  sed "s|^BACKUP_DIR=.*|BACKUP_DIR=$mixed|" "$TMP_DIR/nokey.env" >"$TMP_DIR/mixed.env"
  ENV_FILE="$TMP_DIR/mixed.env" PATH="$fakeage:$PATH" bash "$SCRIPTS_DIR/backup" >/dev/null 2>&1
  local mixed_kept
  mixed_kept="$(all_backup_files "$mixed" | wc -l | tr -d ' ')"
  echo "  kept $mixed_kept backup files"
  check "(aj) the new backup is a .tar" test "$(find "$mixed" -maxdepth 1 -type f -name "rechnungen-$(date +%Y-%m-%d)-*.tar" -size +0 | wc -l | tr -d ' ')" = 1
  check "(aj) the 13 newest dummies (days 3 to 15, both kinds) are kept" bash -c "
    for i in \$(seq 3 15); do
      d=\$(date -u -d \"\$i days ago\" +%Y-%m-%d 2>/dev/null || date -u -v-\"\$i\"d +%Y-%m-%d)
      [ -e '$mixed'/rechnungen-\$d-0315.tar ] || [ -e '$mixed'/rechnungen-\$d-0315.tar.age ] || exit 1
    done"
  check "(aj) older daily files (days 16 to 22) are gone unless the newest of their month" retention_oldest_daily_pruned "$mixed"
  check "(aj) no more than 14 + 12 monthly files remain ($mixed_kept)" test "$mixed_kept" -le 26
  check "(aj) nothing older than 12 months remains" retention_nothing_ancient "$mixed"
  check "(aj) foreign files, the look-alike and both safety copies survive" test -f "$mixed/notes-do-not-delete.txt" \
    -a -f "$mixed/rechnungen-2020-01-01-0000.tar.gz" -a -f "$mixed/rechnungen-safety-2020-01-01-0000.tar" -a -f "$mixed/rechnungen-safety-2020-01-01-0001.tar.age"

  echo "== restore of an unencrypted backup needs no key"
  psql_test -c "delete from public.customers where name = 'Plain Kunde'" >/dev/null
  psql_test -c "insert into public.customers (tenant_id, name) values ('$tenant', 'Added after plain backup')" >/dev/null
  # No AGE_IDENTITY, no terminal (stdin is /dev/null) and an age that fails when called.
  plain_restore_out="$(env -u AGE_IDENTITY ENV_FILE="$TMP_DIR/nokey.env" PATH="$fakeage:$PATH" bash "$SCRIPTS_DIR/restore" --yes "$plain_archive" 2>&1 </dev/null)" \
    || { echo "$plain_restore_out" | tail -n 15; fail "(ak) restore of the .tar without a key succeeds"; }
  tail -n 4 <<<"$plain_restore_out" | sed 's/^/  | /'
  check "(ak) it never asked for a key" bash -c "! grep -qi 'age key' <<<\"\$1\"" _ "$plain_restore_out"
  check "(ak) the age program was never called (restore and its safety backup)" test ! -e "$TMP_DIR/age-called"
  check "(ak) restored: the customer from the backup is back, the later one is gone" test \
    "$(psql_test -c "select count(*) filter (where name = 'Plain Kunde')::text || count(*) filter (where name = 'Added after plain backup')::text from public.customers")" = 10
  wait_for_login_page || true
  token="$(access_token "$TEST_EMAIL" "$TEST_PASSWORD")"
  check "(ak) restored: login with the old password works" test -n "$token"
  storage_download "$token" "$tenant/logo-2.png" "$TMP_DIR/logo2.after" || true
  check "(ak) restored: the storage object comes back with identical bytes" cmp -s "$plain_logo" "$TMP_DIR/logo2.after"
  check "(ak) the safety copy of the old data is an unencrypted rechnungen-safety-....tar, mode 600" bash -c "
    f=\$(find '$plain' -maxdepth 1 -type f -name 'rechnungen-safety-*.tar'); [ -n \"\$f\" ] &&
    [ \"\$(echo \"\$f\" | wc -l | tr -d ' ')\" = 1 ] && tar -xOf \"\$f\" data.sql | grep -q 'Added after plain backup'"
  check "(ak) the safety copy has mode 600" test "$(file_mode "$(find "$plain" -maxdepth 1 -type f -name 'rechnungen-safety-*.tar')")" = 600
  ENV_FILE="$TMP_DIR/nokey.env" bash "$SCRIPTS_DIR/status" >"$TMP_DIR/status-nokey2.log"
  check "(ak) status lists the .tar safety copy separately" bash -c "sed -n '/^== safety copies/,\$p' '$TMP_DIR/status-nokey2.log' | grep -qE 'rechnungen-safety-.*\.tar\$'"
  if env -u AGE_IDENTITY ENV_FILE="$TMP_DIR/nokey.env" bash "$SCRIPTS_DIR/restore" --yes "$TMP_DIR/logo2.after" >"$TMP_DIR/badname.log" 2>&1 </dev/null; then
    fail "(ak) restore of a file that is neither .tar nor .tar.age is refused"
  else
    check "(ak) restore of a file that is neither .tar nor .tar.age is refused with a clear message" grep -q '\.tar\.age or \.tar' "$TMP_DIR/badname.log"
  fi

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

  echo "== restore with machine overrides (moving to another machine)"
  local ov_env="$TMP_DIR/nokey.env" ov_out bad ov_rc
  cp "$ov_env" "$TMP_DIR/ov-before.env"
  psql_test -c "insert into public.customers (tenant_id, name) values ('$tenant', 'Must survive refused overrides')" >/dev/null
  for bad in "APP_HOST=bad host" "BACKUPS=maybe" "AGE_RECIPIENT=notakey" "HTTPS_PORT=abc"; do
    ov_rc=0
    ov_out="$(env "$bad" ENV_FILE="$ov_env" bash "$SCRIPTS_DIR/restore" --yes "$plain_archive" 2>&1 </dev/null)" || ov_rc=$?
    check "(an) restore refuses the override '$bad' before destroying anything" bash -c "
      [ '$ov_rc' != 0 ] && ! grep -qE 'Stopping the current stack|Making a safety backup|RESTORE INCOMPLETE' <<<\"\$1\"" _ "$ov_out"
  done
  check "(an) the refused overrides left the .env untouched" cmp -s "$TMP_DIR/ov-before.env" "$ov_env"
  check "(an) the refused overrides left the data untouched" test \
    "$(psql_test -c "select count(*) from public.customers where name = 'Must survive refused overrides'")" = 1
  ov_out="$(env APP_HOST=other.localhost BACKUPS=off AGE_RECIPIENT= ENV_FILE="$ov_env" PATH="$fakeage:$PATH" bash "$SCRIPTS_DIR/restore" --yes "$plain_archive" 2>&1 </dev/null)" \
    || { echo "$ov_out" | tail -n 15; fail "(an) restore with overrides succeeds"; }
  tail -n 3 <<<"$ov_out" | sed 's/^/  | /'
  check "(an) it prints which keys it overrides" grep -q 'restored .env gets these values from the environment: APP_HOST BACKUPS AGE_RECIPIENT' <<<"$ov_out"
  check "(an) the restored .env has the new values" bash -c "grep -qx 'APP_HOST=other.localhost' '$ov_env' && grep -qx 'BACKUPS=off' '$ov_env' && [ \"\$(grep -c '^AGE_RECIPIENT=\$' '$ov_env')\" = 1 ] && [ \"\$(grep -c '^BACKUPS=' '$ov_env')\" = 1 ]"
  check "(an) every other value (secrets, ports) is the one from the backup" bash -c "
    for k in POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY HTTPS_PORT HTTP_PORT COMPOSE_PROJECT_NAME BACKUP_DIR; do
      [ \"\$(grep \"^\$k=\" '$TMP_DIR/ov-before.env')\" = \"\$(grep \"^\$k=\" '$ov_env')\" ] || exit 1
    done"
  ov_rc=0
  for _ in $(seq 1 30); do
    ov_rc="$(curl -ksS --resolve "other.localhost:$TEST_HTTPS_PORT:127.0.0.1" -o /dev/null -w '%{http_code}' "https://other.localhost:$TEST_HTTPS_PORT/login" 2>/dev/null || true)"
    [ "$ov_rc" = 200 ] && break
    sleep 2
  done
  check "(an) Caddy serves /login under the new name (got $ov_rc)" test "$ov_rc" = 200
  check "(an) the restored data is there" test "$(psql_test -c "select count(*) from public.customers where name = 'Plain Kunde'")" = 1
  check "(an) status reports backups off afterwards" bash -c "ENV_FILE='$ov_env' bash '$SCRIPTS_DIR/status' | head -n 1 | grep -q '^Backups: OFF'"
  check "(an) the age program was never called" test ! -e "$TMP_DIR/age-called"
}

retention_oldest_daily_pruned() { # day 16..22 daily files must be gone unless they are the newest backup of an older month
  local dir=$1 i name ext month other newest
  for i in 16 17 18 19 20 21 22; do
    for ext in tar.age tar; do
      name="rechnungen-$(days_ago "$i")-0315.$ext"
      [ -f "$dir/$name" ] || continue
      # Still there: only allowed when it is the newest file of its month (of either kind).
      month="${name:11:7}"
      newest="$(all_backup_files "$dir" | grep "/rechnungen-$month-" | tail -n 1)"
      other="$dir/$name"
      [ "$newest" = "$other" ] || return 1
    done
  done
  return 0
}

retention_nothing_ancient() {
  local dir=$1 cutoff
  cutoff="$(days_ago 400)"
  ! all_backup_files "$dir" | sed 's|.*/rechnungen-||' | awk -v c="$cutoff" 'substr($0, 1, 10) < c { found = 1 } END { exit !found }'
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
  if (cd "$REPO_DIR" && E2E_BASE_URL="https://$TEST_HOST:$TEST_HTTPS_PORT" E2E_REGISTRATION=on E2E_EMAIL="$TEST_EMAIL" E2E_PASSWORD="$TEST_PASSWORD" npx playwright test); then
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
  run_setup register
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
