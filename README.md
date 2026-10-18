# Invoice app

A German invoicing web app (customers, articles, invoices, PDF and Word export, several businesses per account): a Next.js 16
app on Supabase components, run with Docker on a Raspberry Pi or any small Linux machine. It is meant for the home network
only and is not reachable from the internet.

## Quickstart

Needs 64-bit Linux (for example Raspberry Pi OS 64-bit on a Pi 5), Docker with the Compose plugin usable without `sudo`, `git`
and `openssl`, and ports 80 and 443 free.

```bash
git clone https://github.com/paulhauptmann14/invoice-generator.git ~/docker/invoice-generator
```

```bash
cd ~/docker/invoice-generator/deploy/self-hosted && scripts/setup
```

The setup asks only for the name the app is reached at (for example `raspberrypi.local`; it must resolve to this machine). It
creates no account: open the app and choose "Konto anlegen" to create yours (password of at least 12 characters), then name your
first business. The first build takes several minutes on a Pi; if it stops with "did not become healthy", run it again or allow more time with
`HEALTH_TIMEOUT=900 scripts/setup`. Do not delete `.env` to start over (that creates secrets that do not match the data).

Then open `https://<name>` in a browser, continue past the certificate warning and choose "Konto anlegen". Done. Everyone who
can reach the app in your network can create an account, and every account only sees its own businesses. To switch registration
off once your accounts exist, set `REGISTRATION=off` in `deploy/self-hosted/.env` and run `docker compose up -d` there. Backups are **off** until you turn
them on ([Backups](#backups)).

## Contents

1. [Trust the certificate (optional)](#trust-the-certificate-optional)
2. [Operations](#operations)
3. [Backups](#backups)
4. [Security](#security)
5. [Troubleshooting](#troubleshooting)
6. [Development](#development)

## Trust the certificate (optional)

The browser warns because Caddy signs the HTTPS certificate with its own certificate authority for a home-network name; the
connection is still encrypted. You can simply continue past the warning ("Advanced", "Continue"). To remove the warning, trust the
authority once per device. Export the file on the server (run it in your home directory so it does not end up in the
repository), then copy it to the device:

```bash
cd ~ && ~/docker/invoice-generator/deploy/self-hosted/scripts/cert
```

This writes `~/rechnungen-root.crt`, for example to the Mac with `scp <user>@<host>:rechnungen-root.crt ~/Downloads/`.

- **macOS:** double-click the file, then in Keychain Access open "Caddy Local Authority ...", expand "Trust" and set "When using
  this certificate" to "Always Trust".
- **iPhone / iPad:** open the file (AirDrop), install the profile in Settings, then switch on full trust under Settings,
  General, About, Certificate Trust Settings.
- **Windows:** double-click the `.crt`, "Install Certificate", store "Trusted Root Certification Authorities".

If a device cannot resolve `<name>.local` (some Windows PCs), add a DNS entry for the Pi in your router instead.

## Operations

Run these in `~/docker/invoice-generator/deploy/self-hosted`:

- `scripts/status`: containers, disk space, whether backups are on, the newest backup.
- `scripts/update`: backup (only if backups are on), `git pull`, new app image, migrations, restart. With backups off, run
  `scripts/backup` by hand first.
- `scripts/set-password <email>`: new password for an account (there is no reset e-mail on the server).

## Backups

Backups are **off by default** (`BACKUPS=off` in `.env`). Off means: the nightly timer does nothing, and `update` and `restore`
skip their automatic backup/safety backup. `scripts/backup` can always be run by hand, also when backups are off.

A backup is one file `rechnungen-YYYY-MM-DD-HHMM.tar` (database data, stored files, the certificate authority and `.env`). The
newest 14 are kept, plus the newest of each of the last 12 months.

**Turn on backups** (once you have an external disk):

1. Mount the disk, ext4 recommended (exFAT, NTFS and FAT ignore file permissions), create a directory on it that belongs to
   your user, and set it in `.env`:

```bash
sudo mkdir -p /mnt/backup/rechnungen && sudo chown "$USER": /mnt/backup/rechnungen
```

   ```text
   BACKUP_DIR=/mnt/backup/rechnungen
   ```
2. Recommended, because the disk can be carried away: encrypt the backups. Without a key a backup is a plain file that anyone
   who plugs the disk in can read. Create a key pair on your **Mac** (not on the server), keep the file in your password
   manager and put the public `age1...` value into `.env`. **Without the private key an encrypted backup cannot be restored.**

```bash
age-keygen -o ~/rechnungen-backup.key
```

   ```text
   AGE_RECIPIENT=age1...
   ```

   Backups are then named `rechnungen-....tar.age`. (Install `age` on the server first if needed.) Older `.tar` backups stay
   unencrypted: delete them if the disk leaves the house.
3. Set `BACKUPS=on` in `.env`.
4. Install the nightly timer (03:15) and check it:

```bash
cd ~/docker/invoice-generator/deploy/self-hosted && sed -e "s|@USER@|$USER|" -e "s|@REPO_DIR@|$HOME/docker/invoice-generator|" systemd/rechnungen-backup.service | sudo tee /etc/systemd/system/rechnungen-backup.service && sudo cp systemd/rechnungen-backup.timer /etc/systemd/system/
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now rechnungen-backup.timer
```

```bash
cd ~/docker/invoice-generator/deploy/self-hosted && scripts/backup && scripts/status
```

`scripts/status` should show "Backups: on" and the new file as "encrypted" or "NOT encrypted". There is no alert when a backup
fails: look at `scripts/status` now and then (and `journalctl -u rechnungen-backup`).

**Restore** replaces all data on the machine with a backup (it makes a safety copy first if backups are on; with backups off
there is none, so run `scripts/backup` by hand first if the current data matters). It says so before it asks for confirmation.
A `.tar.age` file needs the private key (it asks for the path, or set `AGE_IDENTITY`) and `age` on the machine; a `.tar` file
needs neither:

```bash
cd ~/docker/invoice-generator/deploy/self-hosted && scripts/restore /mnt/backup/rechnungen/<file>
```

**Moving to another machine:** run `scripts/backup` by hand on the old machine (works with backups off) and copy the file. On the
new machine meet the requirements and clone the repository as in the [Quickstart](#quickstart), then run `scripts/restore`
instead of `scripts/setup`. The restored `.env` is the old one, so set what differs on the new machine in the environment; each
variable you set (`APP_HOST`, `HTTP_PORT`, `HTTPS_PORT`, `BACKUPS`, `BACKUP_DIR`, `AGE_RECIPIENT`) replaces that line, and
invalid values are refused before anything is changed. For example, from a Mac test installation to the Pi, without backups and
without a key (the key is only needed for a `.tar.age` file, and then `age` must be installed on the new machine):

```bash
cd ~/docker/invoice-generator/deploy/self-hosted && APP_HOST=raspberrypi.local BACKUPS=off AGE_RECIPIENT= scripts/restore <file>
```

Accounts, invoices and the certificate authority come along, so devices that already trust it keep trusting it; only the name in
the browser changes if you chose a new one.

## Security

- Home network only. Do not forward ports on your router and do not put the app behind a tunnel (for example a Cloudflare
  Tunnel).
- Only ports 80 and 443 (Caddy) are published. Docker-published ports bypass the `ufw` firewall, so never add `ports:` entries to
  `compose.yml`.
- `.env` holds all secrets (mode 600) and is part of every backup. Unencrypted backups on removable disks are readable by
  anyone who plugs the disk in; exFAT, NTFS and FAT ignore file permissions.
- The app container only gets the "anon" key; the `service_role` key goes to the storage service only.

## Troubleshooting

- **Raspberry Pi 5, a container keeps restarting and its log mentions the page size:** use the 4 KB kernel, then reboot and run
  `scripts/setup` again:

```bash
echo 'kernel=kernel8.img' | sudo tee -a /boot/firmware/config.txt
```

- **`docker info` says "No memory limit support":** append `cgroup_enable=memory` to the single line in
  `/boot/firmware/cmdline.txt`, then reboot:

```bash
sudo sed -i '1 s/$/ cgroup_enable=memory/' /boot/firmware/cmdline.txt
```

## Development

### Local setup (Supabase CLI)

Needs Node.js (the Docker image uses Node 24), Docker, and the Supabase CLI (a dev dependency, started through the `npm run db:*` scripts).

```bash
npm install
```

```bash
npm run db:start
```

```bash
npm run dev
```

Open http://localhost:3000. Local Supabase Studio is at http://127.0.0.1:54323; test e-mails (for example "forgot password")
arrive in Mailpit at http://127.0.0.1:54324. The seed data (`supabase/seed.sql`, local only) contains the user
`dev@invoice.localhost` with the password `lokales-dev-passwort-123`, owner of two example businesses, and
`stranger@invoice.localhost` without a business.

`npm run db:reset` wipes the local data and re-applies migrations and seed; to apply only new migrations and keep the data use
`npx supabase migration up`.

### Checks

| Command | What it runs |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run test:integration` | Integration tests (needs `npm run db:start`) |
| `npm run db:test` | Database tests (pgTAP) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build |

Packages are pinned to exact versions (`.npmrc`), and `npm audit --omit=dev` should report 0 vulnerabilities.

### Tests for the self-hosted stack

`deploy/self-hosted/tests/stack-test.sh` runs the real Compose stack under its own project name (`rechnungen-test`, ports
8080/8443) and tears it down afterwards, without touching your local Supabase. It needs Docker, `age` (for the encrypted-backup checks) and, for the security lint, internet access.

```bash
deploy/self-hosted/tests/stack-test.sh all
```

`all` runs three fresh stacks one after another and takes about 10 minutes. You can also run a single part: `setup`,
`backup`, `e2e` (Playwright main flow; add `lint` as a second argument to run the security lint on the same stack) or `lint`.
`KEEP=1` leaves the stack running afterwards.

The Playwright test (`npm run test:e2e`) can also be pointed at any running instance with the environment variables
`E2E_BASE_URL`, `E2E_EMAIL` and `E2E_PASSWORD` (add `E2E_REGISTRATION=on` for an instance with open registration: the flow then starts by creating the account).

Shell scripts must pass `shellcheck`.
