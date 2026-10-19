# Operations guide (self-hosted)

How to run the app on your own machine once it is installed ([Install](../../README.md#install) in the main README):
certificates, everyday commands, registration, backups, restore and moving, security and troubleshooting.

All commands run in `~/docker/invoice-generator/deploy/self-hosted` unless a block says otherwise.

## Table of Contents

- [Trust the certificate](#trust-the-certificate)
- [Everyday commands](#everyday-commands)
- [Registration](#registration)
- [Backups](#backups)
- [Restore](#restore)
- [Move to another machine](#move-to-another-machine)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

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
- **iPhone / iPad:** open the file (AirDrop), install the profile in Settings, then switch on full trust under Settings,
  General, About, Certificate Trust Settings.
- **Windows:** double-click the `.crt`, "Install Certificate", store "Trusted Root Certification Authorities".

If a device cannot resolve `<name>.local` (some Windows PCs), add a DNS entry for the server in your router instead.

## Everyday commands

| Command | What it does |
|---|---|
| `scripts/status` | Containers, disk space, whether backups are on, the newest backup |
| `scripts/update` | Backup (only if backups are on), `git pull`, new app image, migrations, restart |
| `scripts/backup` | Backup now, also when automatic backups are off |
| `scripts/set-password <email>` | New password for an account (the server sends no e-mail) |
| `scripts/cert` | Export the root certificate ([Trust the certificate](#trust-the-certificate)) |
| `scripts/restore <file>` | Replace all data with a backup ([Restore](#restore)) |

With backups off, run `scripts/backup` by hand before `scripts/update`.

## Registration

New installations start with `REGISTRATION=on`: everyone who can reach the app in your network can create an account with
"Konto anlegen", and every account only sees its own businesses. To switch registration off once your accounts exist, set
`REGISTRATION=off` in `.env` and restart:

```bash
docker compose up -d
```

## Backups

Backups are **off by default** (`BACKUPS=off` in `.env`). Off means: the nightly timer does nothing, and `update` and
`restore` skip their automatic backup or safety backup. `scripts/backup` always works by hand.

A backup is one file `rechnungen-YYYY-MM-DD-HHMM.tar` with the database data, stored files, the certificate authority and
`.env`. The newest 14 are kept, plus the newest of each of the last 12 months.

### Turn on backups

Do this once you have an external disk.

1. Mount the disk (ext4 recommended: exFAT, NTFS and FAT ignore file permissions) and create a directory on it that belongs
   to your user:

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

4. Install the nightly timer (03:15):

   ```bash
   sed -e "s|@USER@|$USER|" -e "s|@REPO_DIR@|$HOME/docker/invoice-generator|" systemd/rechnungen-backup.service | sudo tee /etc/systemd/system/rechnungen-backup.service && sudo cp systemd/rechnungen-backup.timer /etc/systemd/system/
   ```

   ```bash
   sudo systemctl daemon-reload && sudo systemctl enable --now rechnungen-backup.timer
   ```

5. Check it:

   ```bash
   scripts/backup && scripts/status
   ```

   `scripts/status` should show "Backups: on" and the new file as "encrypted" or "NOT encrypted".

There is no alert when a backup fails: look at `scripts/status` now and then, and at `journalctl -u rechnungen-backup`.

## Restore

Restore replaces **all data** on the machine with a backup. It says so and asks for confirmation first. With backups on it
makes a safety copy first; with backups off there is none, so run `scripts/backup` by hand if the current data matters.

```bash
scripts/restore /mnt/backup/rechnungen/<file>
```

A `.tar.age` file needs `age` on the machine and the private key (restore asks for its path, or set `AGE_IDENTITY`). A `.tar`
file needs neither.

## Move to another machine

1. On the old machine, run `scripts/backup` by hand (works with backups off) and copy the file over.
2. On the new machine, meet the [requirements](../../README.md#requirements) and clone the repository as in the
   [Install](../../README.md#install) steps, but run `scripts/restore` instead of `scripts/setup`.

The restored `.env` is the old one. Set what differs on the new machine in the environment: each variable you set
(`APP_HOST`, `HTTP_PORT`, `HTTPS_PORT`, `BACKUPS`, `BACKUP_DIR`, `AGE_RECIPIENT`) replaces its line, and invalid values are
refused before anything changes. For example, from a test installation on a Mac to the Pi, without backups and without a key:

```bash
APP_HOST=raspberrypi.local BACKUPS=off AGE_RECIPIENT= scripts/restore <file>
```

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
