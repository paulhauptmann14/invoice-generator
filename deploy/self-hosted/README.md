# Operations guide (self-hosted)

How to run the app on your own machine once it is installed ([Install](../../README.md#install) in the main README):
certificates, everyday commands, registration, backups, restore, a failed update, moving, security and troubleshooting.

All commands run in `~/docker/invoice-generator/deploy/self-hosted` unless a block says otherwise.

## Table of Contents

- [Your own name in the network](#your-own-name-in-the-network)
- [Trust the certificate](#trust-the-certificate)
- [Trusted certificate with DuckDNS (optional)](#trusted-certificate-with-duckdns-optional)
- [Everyday commands](#everyday-commands)
- [Registration](#registration)
- [Backups](#backups)
- [Restore](#restore)
- [Update went wrong](#update-went-wrong)
- [Move to another machine](#move-to-another-machine)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## Your own name in the network

Devices find the machine by its own name (`raspberrypi.local` on a fresh Pi), which setup suggests. For a name of its own,
for example `rechnungen.local`, enter it during setup (or later: change `APP_HOST` in `.env` and run `docker compose up -d`)
and let the machine announce it in the network:

```bash
sudo apt install -y avahi-utils
```

```bash
sed -e "s|@APP_HOST@|$(grep '^APP_HOST=' .env | cut -d= -f2)|" systemd/rechnungen-mdns.service | sudo tee /etc/systemd/system/rechnungen-mdns.service >/dev/null && sudo systemctl daemon-reload && sudo systemctl enable --now rechnungen-mdns.service
```

Check it from another device, for example `ping -c 2 rechnungen.local` on a Mac. The name follows the address the machine has
at startup: reserve that address for it in the router (DHCP reservation). Some Windows PCs do not resolve `.local` names; add a
DNS entry in the router or a line `<address> rechnungen.local` to `C:\Windows\System32\drivers\etc\hosts` there.

## Trust the certificate

The browser warns because Caddy signs the HTTPS certificate with its own certificate authority for a home-network name. The
connection is still encrypted, so you can continue past the warning ("Advanced", "Continue"). To remove the warning, trust the
authority once per device.

Export the file on the server. Run it in your home directory, so the file does not end up in the repository:

```bash
cd ~ && ~/docker/invoice-generator/deploy/self-hosted/scripts/cert
```

This writes `~/rechnungen-root.crt`. Copy it to the device, for example to a Mac:

```bash
scp <user>@<host>:rechnungen-root.crt ~/Downloads/
```

- **macOS:** double-click the file, then in Keychain Access open "Caddy Local Authority ...", expand "Trust" and set "When using
  this certificate" to "Always Trust".
  If Keychain Access refuses the import with error -25294, add it from the Terminal instead (asks for your password):

  ```bash
  security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db ~/Downloads/rechnungen-root.crt
  ```
- **iPhone / iPad:** open the file (AirDrop), install the profile in Settings, then switch on full trust under Settings,
  General, About, Certificate Trust Settings.
- **Windows:** double-click the `.crt`, "Install Certificate", store "Trusted Root Certification Authorities".
- **Firefox** keeps its own list and ignores the system's trust settings by default. Either let it use them (after trusting the
  file in the system as above): open `about:config`, set `security.enterprise_roots.enabled` to `true` and restart Firefox. Or
  import the file into Firefox: Settings, Privacy & Security, "View Certificates", tab "Authorities", "Import", and tick "Trust
  this CA to identify websites".
  If "Drucken" or "PDF ansehen" asks where to save a file instead of showing the PDF, set Settings, General, Applications,
  "Portable Document Format (PDF)" to "Open in Firefox" (the app sends the PDF for viewing; "Always ask where to save files"
  can stay on).

If a device cannot resolve `<name>.local`, see [Your own name in the network](#your-own-name-in-the-network).

## Trusted certificate with DuckDNS (optional)

Instead of trusting Caddy's own authority on every device ([Trust the certificate](#trust-the-certificate)), the app can get a
real Let's Encrypt certificate that every browser accepts without any setup. You need a free name from [DuckDNS](https://www.duckdns.org),
for example `myhome.duckdns.org`. The name points to the **local** address of your server, so the app stays reachable only in
your home network: no port is opened and no tunnel is involved. Let's Encrypt only checks that you own the name (a DNS
challenge, answered with your DuckDNS token); it never connects to your server.

1. Sign in at duckdns.org (with an account of Google, GitHub and so on), choose a name under "domains" and add it.
2. Set the name's "current ip" to the **local address of the server** (for example `192.168.1.50`, not the address DuckDNS
   suggests) and click "update ip". Reserve that address for the server in your router so it does not change.
3. Copy the token from the top of the DuckDNS page. Treat it like a password: with it anyone can change your names.
4. In `.env` (`nano .env`) set these four lines. If `TLS_MODE=internal` or an `APP_HOST` line is there, change it; do not add a
   second one:

   ```text
   TLS_MODE=duckdns
   DUCKDNS_TOKEN=<your token>
   APP_HOST=myhome.duckdns.org
   COMPOSE_FILE=compose.yml:compose.duckdns.yml
   ```

   The last line makes Compose build Caddy with the DuckDNS module (the plain Caddy image has none); `scripts/update` and the
   other scripts refuse a `.env` where these lines do not fit together. The token must be the 36-character one from DuckDNS.
5. Apply it. This builds the Caddy image that includes the DuckDNS module once: it downloads a builder image of about 1 GB and
   the Go packages, so it needs internet and takes a few minutes on a Pi. Afterwards the app and Caddy restart with the new name:

   ```bash
   scripts/update
   ```

   Without the update script: `docker compose up -d --build`. It must be the whole stack, not only `caddy`, because the
   login service also uses `APP_HOST` (for the links in its e-mails).
6. Open `https://myhome.duckdns.org`. From now on Caddy serves only this name: `rechnungen.local` (or whatever `APP_HOST` was)
   no longer works, and the mDNS unit from [Your own name in the network](#your-own-name-in-the-network) is not needed any more
   (`sudo systemctl disable --now rechnungen-mdns.service`). The first issuance takes a minute; until then the page does not load. Watch it with
   `docker compose logs -f caddy` (look for "certificate obtained successfully").

Good to know:

- Some routers refuse DNS answers that point to a local address ("DNS rebind protection", for example on a FRITZ!Box). The
  page then does not load, although the server is fine. Allow the name `myhome.duckdns.org` as an exception in the router
  (FRITZ!Box: Home Network, Network, Network Settings, "DNS rebind protection").
- The server needs internet access, also later: the certificate is valid for 90 days and Caddy renews it by itself about every
  60 days. If the server stays offline until the certificate has expired, browsers warn until it is online again and has
  renewed it.
- The name appears in public certificate lists (Certificate Transparency), as it does for every Let's Encrypt certificate.
  Choose a name that does not reveal anything private.
- The token stays in `.env` and in every backup of it. It is not part of any image. **When a request to DuckDNS fails, the
  DuckDNS library writes the token into Caddy's log**, so `docker compose logs caddy` can contain it: never share those logs
  without removing it first. If it did leak, create a new token on the DuckDNS page and change it in `.env`.
- `scripts/cert` and the root certificate are not needed in this mode.
- When you [move to another machine](#move-to-another-machine) in this mode, set the "current ip" of the DuckDNS name to the new
  machine's local address.

**Go back to Caddy's own authority.** In `.env` set `TLS_MODE=internal`, delete the `DUCKDNS_TOKEN` and `COMPOSE_FILE` lines and
put the old `APP_HOST` back, then run `docker compose up -d` (Caddy is the plain official image again). The certificate authority your devices trusted earlier is still
in the Caddy data, so they trust the app again without a new import.

## Everyday commands

| Command | What it does |
|---|---|
| `scripts/status` | Containers, disk space, whether backups are on, the newest backup, warnings about missing or failed backups |
| `scripts/update` | Backup (also with backups off), `git pull`, new app image (and Caddy image with DuckDNS), migrations, restart, reload of the Caddy configuration |
| `scripts/backup` | Backup now, also when automatic backups are off |
| `scripts/set-password <email>` | New password for an account (the server sends no e-mail) |
| `scripts/cert` | Export the root certificate ([Trust the certificate](#trust-the-certificate)) |
| `scripts/restore <file>` | Replace all data with a backup ([Restore](#restore)) |

`scripts/update --no-backup` skips the backup before the update, `--no-pull` skips `git pull`.

## Registration

New installations start with `REGISTRATION=on`: everyone who can reach the app in your network can create an account with
"Konto anlegen", and every account only sees its own businesses. To switch registration off once your accounts exist, set
`REGISTRATION=off` in `.env` and restart:

```bash
docker compose up -d
```

## Backups

Backups are **off by default** (`BACKUPS=off` in `.env`). Off means only: the nightly timer does nothing. `scripts/backup`
always works by hand, and `update` and `restore` still save a local copy of your data before they change anything:

- `update` writes `rechnungen-preupdate-<date>.tar[.age]` into the backup directory (`./backups` by default, on the
  server's own disk) and keeps the newest two. With backups on, it makes a regular backup instead.
- `restore` writes `rechnungen-safety-<date>.tar[.age]` there and never deletes it. Delete old ones by hand when you no
  longer need them: `scripts/status` lists them.

A backup is one file `rechnungen-YYYY-MM-DD-HHMM.tar` with the database data, stored files, the certificate authority and
`.env`. The newest 14 are kept, plus the newest of each of the last 12 months.

### Turn on backups

Do this once you have an external disk.

1. Mount the disk (ext4 recommended: exFAT, NTFS and FAT ignore file permissions) and create a directory on it that belongs
   to your user. Mount it permanently with a line like this in `/etc/fstab` (find the UUID with `lsblk -f`). Keep `nofail`:
   without it the Pi does not boot when the disk is unplugged.

   ```text
   UUID=<uuid-of-the-disk>  /mnt/backup  ext4  defaults,nofail  0  2
   ```

   ```bash
   sudo mkdir -p /mnt/backup/rechnungen && sudo chown "$USER": /mnt/backup/rechnungen
   ```

   Set it in `.env`:

   ```text
   BACKUP_DIR=/mnt/backup/rechnungen
   ```

2. Recommended, because the disk can be carried away: encrypt the backups with [age](https://github.com/FiloSottile/age).
   Without a key, a backup is a plain file that anyone who plugs the disk in can read. Create the key pair on your **Mac**
   (not on the server) and keep the key file in your password manager:

   ```bash
   age-keygen -o ~/rechnungen-backup.key
   ```

   Put the public `age1...` value into `.env` and install `age` on the server if needed:

   ```text
   AGE_RECIPIENT=age1...
   ```

   Backups are then named `rechnungen-....tar.age`. **Without the private key an encrypted backup cannot be restored.** Older
   `.tar` backups stay unencrypted: delete them if the disk leaves the house.

3. Set `BACKUPS=on` in `.env`.

4. Install the nightly timer (03:15) and the unit that marks a failed run (run this again after an update changed the files
   in `systemd/`):

   ```bash
   for unit in rechnungen-backup rechnungen-backup-failed; do sed -e "s|@USER@|$USER|" -e "s|@REPO_DIR@|$HOME/docker/invoice-generator|" systemd/$unit.service | sudo tee /etc/systemd/system/$unit.service >/dev/null; done && sudo cp systemd/rechnungen-backup.timer /etc/systemd/system/
   ```

   ```bash
   sudo systemctl daemon-reload && sudo systemctl enable --now rechnungen-backup.timer
   ```

5. Check it:

   ```bash
   scripts/backup && scripts/status
   ```

   `scripts/status` should show "Backups: on" and the new file as "encrypted" or "NOT encrypted".

There is no e-mail when a backup fails. `scripts/status` shows a `WARNING` at the top when the last nightly run failed or
when backups are on but the newest backup is older than 2 days (or missing). Look at it now and then, and find the reason in
`journalctl -u rechnungen-backup`. The failure marker (`.backup-failed`) disappears with the next successful backup.

## Restore

Restore replaces **all data** on the machine with a backup. It says so and asks for confirmation first. Before it deletes
anything it saves the current data as `rechnungen-safety-*` in the backup directory, whether backups are on or off (skipped
when the database has no accounts). `--no-safety-backup` turns that off, for example when the old installation is too broken
to back up.

```bash
scripts/restore /mnt/backup/rechnungen/<file>
```

A `.tar.age` file needs `age` on the machine and the private key (restore asks for its path, or set `AGE_IDENTITY`). A `.tar`
file needs neither.

## Update went wrong

`scripts/update` changes nothing when its backup, the pull or the build fails, and rolls a failing migration back: fix the
cause and run it again. If the update finished but the app misbehaves, go back to the old version and the data from before:

1. Find the commit you were on before the update (the commit before the `pull`) and the copy made right before it:

   ```bash
   git reflog -n 5
   ```

   ```bash
   scripts/status
   ```

   The copy is the newest `rechnungen-preupdate-*` (backups off) or the newest regular backup (backups on), listed by
   `scripts/status`.
2. Check out the old code first, so the app and the database changes match the data, then restore:

   ```bash
   git checkout <old commit>
   ```

   ```bash
   scripts/restore <path to that copy>
   ```

   Everything entered since the update is gone from the running app; restore saves it first as `rechnungen-safety-*`
   (only versions with this safety copy do that: when rolling back further, run `scripts/backup` before `scripts/restore`).
3. When a fixed version is available, return to the branch before updating again (`git pull` does not work on a detached
   checkout):

   ```bash
   git checkout main && scripts/update
   ```

## Move to another machine

1. On the old machine, run `scripts/backup` by hand (works with backups off) and copy the file over.
2. On the new machine, meet the [requirements](../../README.md#requirements) and clone the repository as in the
   [Install](../../README.md#install) steps, but run `scripts/restore` instead of `scripts/setup`.

The restored `.env` is the old one. Set what differs on the new machine in the environment: each variable you set
(`APP_HOST`, `HTTP_PORT`, `HTTPS_PORT`, `BACKUPS`, `REGISTRATION`, `TLS_MODE`, `BACKUP_DIR`, `AGE_RECIPIENT`) replaces its line, and invalid values are
refused before anything changes. For example, from a test installation on a Mac to the Pi, without backups and without a key:

```bash
APP_HOST=raspberrypi.local BACKUPS=off AGE_RECIPIENT= scripts/restore <file>
```

With `TLS_MODE=duckdns` the restored `.env` keeps the DuckDNS settings; also set the "current ip" of your DuckDNS name to the new
machine's local address, otherwise the name still points to the old one. The first start there builds the Caddy image
(internet, a few minutes).

Accounts, invoices and the certificate authority come along, so devices that already trust it keep trusting it. Only the
address in the browser changes if you chose a new name.

## Security

- Home network only. Do not forward ports on your router and do not put the app behind a tunnel (for example a Cloudflare
  Tunnel).
- Only Caddy publishes ports (80 and 443). Docker-published ports bypass the `ufw` firewall, so never add `ports:` entries to
  `compose.yml`.
- `.env` holds all secrets (mode 600) and is part of every backup. Unencrypted backups on removable disks are readable by
  anyone who plugs the disk in.
- The app container only gets the "anon" key; the `service_role` key goes to the storage service only.

## Troubleshooting

**Setup stops with "did not become healthy".** The first build takes several minutes on a Pi. Run it again, or allow more
time:

```bash
HEALTH_TIMEOUT=900 scripts/setup
```

Do not delete `.env` to start over: a new one has secrets that do not match the existing data.

**Raspberry Pi 5: a container keeps restarting and its log mentions the page size.** Use the 4 KB kernel, reboot, then run
`scripts/setup` again:

```bash
echo 'kernel=kernel8.img' | sudo tee -a /boot/firmware/config.txt
```

**`docker info` says "No memory limit support".** Append `cgroup_enable=memory` to the single line in
`/boot/firmware/cmdline.txt`, then reboot:

```bash
sudo sed -i '1 s/$/ cgroup_enable=memory/' /boot/firmware/cmdline.txt
```

**The browser still shows an old tab icon after an update.** Browsers keep favicons in their own cache; open the app in a
private window to check. In Safari, quit it and empty `~/Library/Safari/Favicon Cache`.
