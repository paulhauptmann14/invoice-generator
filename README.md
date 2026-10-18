# Invoice app

A German invoicing web app (customers, articles, invoices, PDF and Word export, several businesses per account). It is a
Next.js 16 app on top of Supabase components (Postgres 17, GoTrue, PostgREST, Storage API).

Two ways to run it:

- **Self-hosted (this document, first part):** the whole stack runs in Docker on a Raspberry Pi 5 or a small x86-64 PC in
  your home network. It is not meant to be reachable from the internet (see [Security](#security)).
- **Development:** the Supabase CLI and `npm run dev` on your computer (last chapter).

## Contents

1. [Overview](#overview)
2. [Requirements](#requirements)
3. [Install](#install)
4. [Trust the certificate](#trust-the-certificate)
5. [Daily use](#daily-use)
6. [Change the password](#change-the-password)
7. [Backups](#backups)
8. [Restore](#restore)
9. [Update](#update)
10. [Moving to another machine](#moving-to-another-machine)
11. [Security](#security)
12. [Development](#development)

## Overview

`deploy/self-hosted/compose.yml` starts six containers: `db` (Postgres), `auth`, `rest`, `storage`, `app` (the Next.js
app) and `caddy` (reverse proxy). Caddy is the only container that publishes ports (80 and 443). It serves the app at
`https://rechnungen.local` with a certificate from its own certificate authority, so every device that opens the app
must trust that authority once ([Trust the certificate](#trust-the-certificate)).

All data lives in Docker volumes on the machine. The only copy of it that survives a broken SD card or disk is the
**encrypted backup**, so set up backups ([Backups](#backups)) before you enter real data.

The helper scripts are in `deploy/self-hosted/scripts/`. Run them from `~/invoice-generator/deploy/self-hosted` as
`scripts/<name>`.

| Script | Purpose |
|---|---|
| `scripts/setup` | First installation (also `setup --restore`, used internally by `restore`) |
| `scripts/cert` | Exports the certificate authority file for your devices |
| `scripts/status` | Containers, disk space, last successful backup |
| `scripts/backup` | Encrypted backup (`backup --safety` is the safety copy that `restore` makes) |
| `scripts/restore` | Replaces all data with a backup (also for moving to another machine) |
| `scripts/update` | Backup, new code, new app image, migrations, restart |
| `scripts/set-password` | New password for an account |
| `scripts/migrate` | Applies database migrations (called by `setup`, `update` and `restore`; `--until <version>` stops at a version) |

## Requirements

- A Raspberry Pi 5 with 8 GB RAM, or any 64-bit Linux machine (x86-64 or arm64) with similar resources. The images are
  multi-architecture, so moving from the Pi to a mini PC later only needs a backup and a restore.
- 64-bit Linux with Docker (with the Compose plugin), `git` and `age`. Instructions below are for Raspberry Pi OS Lite
  (64-bit).
- A computer for the one-time preparation (examples use a Mac) with `age` installed (`brew install age`).
- A wired network connection is recommended.
- **SD card note:** a Pi usually boots from an SD card, and SD cards wear out and sometimes fail without warning. Use a
  good card (A2 rating, or an "endurance" card). Daily backups to an **external disk** are what protects you; do not
  skip them ([Backups](#backups)). A USB SSD as boot drive is more robust if you want to upgrade later.

## Install

### 1. Create the backup key pair on your Mac

Backups are encrypted with [age](https://github.com/FiloSottile/age). The key pair is created on your **Mac**, not on the
server: the server only gets the public key, so a stolen server or disk cannot read the backups.

```bash
age-keygen -o ~/rechnungen-backup.key
```

The command prints a line like `Public key: age1...`. Copy the `age1...` value; the setup asks for it.

Keep the file `~/rechnungen-backup.key` safe: put one copy in your password manager (the file is a few lines of text) and
one on another device or a USB stick. **Without this private key no backup can be restored.**

### 2. Install the operating system

If your Mac has no SSH key yet (`ls ~/.ssh/*.pub` shows nothing), create one first; Raspberry Pi Imager offers it in
the SSH settings:

```bash
ssh-keygen -t ed25519
```

1. Install Raspberry Pi Imager on your Mac and choose "Raspberry Pi OS Lite (64-bit)".
2. In the OS customisation dialog set:
   - hostname `rechnungen` (the app is then reachable as `rechnungen.local`; avahi, which answers `.local` names, is
     part of Raspberry Pi OS),
   - a user name and password,
   - SSH enabled, with your public key (public-key authentication),
   - your Wi-Fi only if you cannot use a cable.
3. Write the card, put it into the Pi, connect the cable and power. Wait a few minutes for the first boot.
4. Connect from your Mac (replace `<user>` with the user name you chose):

```bash
ssh <user>@rechnungen.local
```

5. Update the system and reboot:

```bash
sudo apt update && sudo apt full-upgrade -y
```

```bash
sudo reboot
```

Optional but recommended: give the Pi a fixed address in your router (a "DHCP reservation" for the Pi). Some devices
(for example many Android phones and Windows PCs without Bonjour) cannot resolve `.local` names; for them you can add
a DNS entry in your router instead. Choose the name before the setup; this document does not cover changing it later.

### 3. Install Docker, git and age

Docker's own installation script installs Docker Engine and the Compose plugin (read it first if you want:
https://get.docker.com):

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
```

```bash
sudo sh get-docker.sh
```

```bash
sudo apt install -y git age
```

Allow your user to run Docker, then log out and in again so the group applies:

```bash
sudo usermod -aG docker "$USER"
```

```bash
exit
```

After you have reconnected with `ssh <user>@rechnungen.local`, check:

```bash
docker info
```

If the output contains `WARNING: No memory limit support`, the containers' memory limits (`mem_limit` in
`compose.yml`) are not enforced. Enable the memory cgroup by appending `cgroup_enable=memory` to the single line in
`/boot/firmware/cmdline.txt`:

```bash
sudo sed -i '1 s/$/ cgroup_enable=memory/' /boot/firmware/cmdline.txt
```

```bash
sudo reboot
```

### 4. Get the code and run the setup

```bash
git clone https://github.com/paulhauptmann14/invoice-generator.git ~/invoice-generator
```

```bash
cd ~/invoice-generator/deploy/self-hosted
```

```bash
scripts/setup
```

The setup asks for:

- the name the app is reached at (default `rechnungen.local`),
- the public age key (`age1...`) from step 1,
- the e-mail address and password (at least 12 characters, typed twice) of your account,
- the name of your first business.

It then writes `deploy/self-hosted/.env` (generated secrets, readable only by you), starts the stack, applies the
database migrations and builds the app. **The first build takes several minutes on a Pi.** If the setup stops with
"did not become healthy", the machine was only slow; run it again, or allow more time:

```bash
HEALTH_TIMEOUT=900 scripts/setup
```

(`HEALTH_TIMEOUT` is the number of seconds to wait for a container to become healthy, default 300. `update` honours it
too.) It is safe to run `scripts/setup` again: an existing `.env` and an existing account are kept. Do **not** delete
`.env` to "start over": that creates new secrets that do not match the existing data.

At the end it prints the address to open. Continue with the next chapter before you do.

**Raspberry Pi 5 only:** its default kernel uses 16 KB memory pages, which some software built for 4 KB pages does not
support. If a container keeps restarting and its log (`docker compose logs <service>`) mentions the page size, switch
to the 4 KB kernel by adding the line `kernel=kernel8.img` to `/boot/firmware/config.txt`, reboot and run the setup
again:

```bash
echo 'kernel=kernel8.img' | sudo tee -a /boot/firmware/config.txt
```

## Trust the certificate

Caddy signs the HTTPS certificate with its own certificate authority (CA). Browsers warn until each device trusts that CA.
Export the CA file on the server (run it in your home directory so the file does not end up in the repository):

```bash
cd ~ && ~/invoice-generator/deploy/self-hosted/scripts/cert
```

This writes `~/rechnungen-root.crt`. Copy it to your Mac (run this on the Mac):

```bash
scp <user>@rechnungen.local:rechnungen-root.crt ~/Downloads/
```

**macOS:** double-click the file (Keychain Access opens, add it to the "login" keychain). Then double-click the
certificate "Caddy Local Authority ..." in Keychain Access, expand "Trust", set "When using this certificate" to "Always
Trust" and close the window (it asks for your password). Safari and Chrome pick this up. Firefox has its own store
(Settings, Privacy & Security, View Certificates, Import).

**iPhone / iPad:** send the file to the device (AirDrop or e-mail to yourself) and open it. Then:

1. Settings, "Profile Downloaded" (at the top), Install.
2. Settings, General, About, Certificate Trust Settings: switch on full trust for the "Caddy Local Authority" root.

Do this once per device. The CA is part of the backups, so after a restore or a move to a new machine the same
certificate keeps working and devices need no new setup.

Then open `https://rechnungen.local` and sign in with the account you created during the setup.

## Daily use

- Open `https://rechnungen.local` on any device in your home network.
- The stack starts by itself after a power cut or reboot (all containers have `restart: unless-stopped`). Give the Pi a few
  minutes after power returns.
- Check the state of the containers, the free disk space and the last successful backup (file name and time):

```bash
cd ~/invoice-generator/deploy/self-hosted && scripts/status
```

- Look at the log of a container (`app`, `db`, `auth`, `rest`, `storage` or `caddy`), for example when something fails:

```bash
cd ~/invoice-generator/deploy/self-hosted && docker compose logs --tail 50 app
```

- Restart the app container:

```bash
cd ~/invoice-generator/deploy/self-hosted && docker compose restart app
```

- Shut the Pi down cleanly before unplugging it:

```bash
sudo shutdown -h now
```

## Change the password

There is no password reset by e-mail on the server (no mail server is configured; the switch `PASSWORD_RESET_EMAIL` is set to
`off` in `compose.yml`). Set a new password on the server instead; the account is signed out on all devices:

```bash
cd ~/invoice-generator/deploy/self-hosted && scripts/set-password you@example.com
```

Use the e-mail address of the account. The script asks for the new password twice (at least 12 characters).

## Backups

### What a backup contains

`scripts/backup` writes one encrypted file `rechnungen-YYYY-MM-DD-HHMM.tar.age` containing

- the database content (a data-only dump of the application schemas; the structure comes from the migrations),
- the stored files (uploaded logos, archived PDFs),
- Caddy's certificate authority (so devices keep trusting the server after a restore),
- the `.env` file (all secrets),
- a list of the database changes (migrations) the data belongs to, and the version (git commit) of the code that made the
  backup. The restore needs the list to load the data into the matching database structure.

The file can only be opened with the private key from [Install](#install) step 1. The app keeps running during a backup. The
database dump and the file archives are taken one after another, not as one atomic snapshot; for a single-user app backed up
at night this makes no practical difference.

Old backups are removed automatically: the newest 14 are kept, plus the newest backup of each of the last 12 months. The
count includes the backups made before updates. Files named `rechnungen-safety-*.tar.age` are safety copies that a restore
makes of the data it replaces; they are never removed automatically (delete them yourself when you no longer need them),
and `scripts/status` lists them separately from the regular backups.

Before it dumps the database, the script waits (up to `HEALTH_TIMEOUT` seconds, default 300) until the database is up. This
matters for the nightly timer: after a power cut, the catch-up run starts right at boot.

The script refuses to run when the system clock shows a year before 2026. A Pi has no battery-backed clock and can believe
it is 1970 until the network time arrives; a backup with a wrong date would get a misleading name. If this happens right
after boot, wait a minute and run it again. Only one backup runs at a time (a second one waits up to 10 minutes). If the Pi
loses power during a backup, the unfinished file is named `.partial.*` in the backup directory; you can delete such files.

The Docker volume `db-config` (a key for the database extension pgsodium) is not part of a backup. That is fine: the app does
not use Vault or pgsodium.

### Make a first backup

```bash
cd ~/invoice-generator/deploy/self-hosted && scripts/backup
```

By default the files go to `~/invoice-generator/deploy/self-hosted/backups/` (git-ignored). That is the SD card; the next
section moves them to an external disk.

### Use an external disk (first-time setup)

A backup on the same SD card is lost together with it, so keep backups on an external USB disk.

**This section formats the disk and erases everything on it. If the disk already holds backups (new SD card, new machine),
do not follow it; use [Connect an existing backup disk](#connect-an-existing-backup-disk) instead.**

Use the Linux file system **ext4**. Disks formatted as exFAT, NTFS or FAT (the usual factory format) cannot hold Linux
ownership and permissions, so `chown` fails below and backups would fail; format them as ext4 first (step 2).

1. Plug the disk in and find it. Note the `UUID` and the file system type (`FSTYPE`) of its partition:

```bash
lsblk -f
```

2. Format the disk as ext4. **This erases the disk;** replace `sdX1` with the partition from the output above (double-check
   it):

```bash
sudo mkfs.ext4 -L rechnungen-backup /dev/sdX1
```

3. Create the mount point and make the disk mount at boot. `nofail` lets the Pi boot even if the disk is missing:

```bash
sudo mkdir -p /mnt/backup
```

```bash
sudo nano /etc/fstab
```

Add one line at the end (replace `<uuid>` with the UUID from step 1):

```text
UUID=<uuid> /mnt/backup ext4 defaults,nofail 0 2
```

```bash
sudo systemctl daemon-reload && sudo mount -a
```

```bash
sudo mkdir -p /mnt/backup/rechnungen && sudo chown "$USER": /mnt/backup/rechnungen
```

4. Point the backups at it: open `.env` and set `BACKUP_DIR`:

```bash
nano ~/invoice-generator/deploy/self-hosted/.env
```

```text
BACKUP_DIR=/mnt/backup/rechnungen
```

5. Run a backup and check that the file appears on the disk:

```bash
cd ~/invoice-generator/deploy/self-hosted && scripts/backup && scripts/status
```

If the disk is missing at boot or unplugged, the backup fails (the directory on the disk is not there, and nothing is written to
the SD card) and `scripts/status` keeps showing the date of the last successful backup. Backups made earlier into
`deploy/self-hosted/backups/` stay on the SD card; copy them to the disk if you want to keep them.

### Connect an existing backup disk

Use this on a new SD card or a new machine, when the disk already holds your backups.

**Never run `mkfs` (or format the disk in any other way) here: it would erase the backups.** You only mount the disk.

1. Plug the disk in and note the `UUID` of its partition:

```bash
lsblk -f
```

2. Create the mount point and add the same `/etc/fstab` line as in the first-time setup (use the `UUID` and, if it is not
   `ext4`, the file system shown by `lsblk -f`):

```bash
sudo mkdir -p /mnt/backup
```

```bash
sudo nano /etc/fstab
```

```text
UUID=<uuid> /mnt/backup ext4 defaults,nofail 0 2
```

```bash
sudo systemctl daemon-reload && sudo mount -a
```

3. Check that your backup files are there:

```bash
ls -l /mnt/backup/rechnungen
```

4. If the files belong to a different user ID than your new user, make the directory yours again (otherwise new backups fail):

```bash
sudo chown -R "$USER": /mnt/backup/rechnungen
```

5. Make sure `BACKUP_DIR=/mnt/backup/rechnungen` is set in `~/invoice-generator/deploy/self-hosted/.env` (a restore brings it
   back from the backup; otherwise edit the file as in the first-time setup).

### Nightly backup with a systemd timer

The repository contains a service and a timer (daily at 03:15, and at the next boot if the Pi was off at that time). Install
them, filling in your user name and the repository path:

```bash
sed -e "s|@USER@|$USER|" -e "s|@REPO_DIR@|$HOME/invoice-generator|" ~/invoice-generator/deploy/self-hosted/systemd/rechnungen-backup.service | sudo tee /etc/systemd/system/rechnungen-backup.service
```

```bash
sudo cp ~/invoice-generator/deploy/self-hosted/systemd/rechnungen-backup.timer /etc/systemd/system/
```

```bash
sudo systemctl daemon-reload
```

```bash
sudo systemctl enable --now rechnungen-backup.timer
```

Test it once by starting the service by hand, then read its log:

```bash
sudo systemctl start rechnungen-backup.service
```

```bash
journalctl -u rechnungen-backup -n 20
```

When is the next run, and did the last one work?

```bash
systemctl list-timers rechnungen-backup.timer
```

**There is no alert if a backup fails.** Once a week check `scripts/status`: under "newest backup" it shows the last
**successful** backup file (its name contains the date) and when it was written. If that is older than yesterday, read
`journalctl -u rechnungen-backup` to see why the backups fail.

### Practise a restore once

A backup you have never restored is a hope, not a backup. Try it on your Mac with a separate copy of the code, so that your
development setup is not touched. This needs Docker Desktop, `age` and `git` on the Mac, and free ports 80 and 443. Copy
the newest backup from the disk or the Pi to the Mac, for example:

```bash
scp <user>@rechnungen.local:invoice-generator/deploy/self-hosted/backups/rechnungen-2026-01-01-0315.tar.age ~/Downloads/
```

(use the real file name; `scripts/status` prints the full path of the newest backup. With an external disk it is
`/mnt/backup/rechnungen/<file>`, so use `<user>@rechnungen.local:/mnt/backup/rechnungen/<file>`.) Then, on the Mac:

```bash
git clone https://github.com/paulhauptmann14/invoice-generator.git ~/rechnungen-restore-test
```

```bash
cd ~/rechnungen-restore-test/deploy/self-hosted
```

```bash
scripts/restore ~/Downloads/rechnungen-2026-01-01-0315.tar.age
```

It asks for the path of your private key (`~/rechnungen-backup.key`) and for a confirmation, then builds the app (several
minutes). It ends with a line "Restore finished" and an address; ignore the address, because `rechnungen.local` points to
the Pi, not to the Mac. To look at the restored copy, ask the Mac's stack directly (`200` means the app answers):

```bash
curl -ksI --resolve rechnungen.local:443:127.0.0.1 https://rechnungen.local/login
```

Remove the test afterwards, on the Mac. **`down -v` deletes the data volumes of whichever stack lives in the directory it runs
in. Never run it without the `cd`, and never on the Pi:**

```bash
cd ~/rechnungen-restore-test/deploy/self-hosted && docker compose down -v
```

```bash
rm -rf ~/rechnungen-restore-test
```

## Restore

`scripts/restore` replaces **all** data on the machine with the content of a backup. You need the backup file and your private
age key file. There are two situations: the machine still works (below), or you start on a new machine or a new SD card
([Restore on a new machine](#restore-on-a-new-machine-or-sd-card)).

```bash
cd ~/invoice-generator/deploy/self-hosted && scripts/restore /mnt/backup/rechnungen/rechnungen-2026-01-01-0315.tar.age
```

(Use the real file name and path.) The script

1. decrypts and checks the backup first; with a wrong key or a damaged file nothing is changed,
2. asks for the path of the private key (or reads the environment variable `AGE_IDENTITY`) before it decrypts, and for you to
   type `yes` afterwards,
3. makes a safety backup of the current data (`rechnungen-safety-*.tar.age` in the backup directory; it never removes other
   backups; skipped when the database has no accounts, for example on a new machine), then deletes the current data,
4. loads the backup into the database structure it was made with (the database changes up to the backup's newest one are
   applied first, the data is loaded, then newer changes of this version of the code are applied on top of the restored
   data), and restarts the stack. It prints the address to open.

A backup made by a **newer** version of the code than the one checked out is refused, before anything is changed ("check out
a newer version"). Run `git pull` in `~/invoice-generator` and restore again. Backups from before the migration list existed
are still restored, with a warning.

Options: `--yes` skips the confirmation question; `--no-safety-backup` skips step 3's safety backup (only for a machine so
broken that it cannot make a backup).

If the restore stops half way, it prints "RESTORE INCOMPLETE" together with the cause, the path of the safety backup and the
name of the saved old `.env`. The app is not running then. Fix the cause and run the same command again with the same backup
file; it is safe to repeat.

### Restore on a new machine or SD card

This is the way after a dead SD card and the way to move to another machine (see [Moving to another machine](#moving-to-another-machine)).
Do **not** run `scripts/setup`; the restore does the setup itself.

1. On your Mac: the new system has the same name but a new SSH identity, so the Mac would refuse to connect ("REMOTE HOST
   IDENTIFICATION HAS CHANGED"). Forget the old one:

```bash
ssh-keygen -R rechnungen.local
```

2. Install the operating system (hostname `rechnungen`) and Docker, git and age as in [Install](#install) steps 2 and 3, then
   clone the repository:

```bash
git clone https://github.com/paulhauptmann14/invoice-generator.git ~/invoice-generator
```

3. Get the backup file onto the machine. Either connect the external disk that holds it
   ([Connect an existing backup disk](#connect-an-existing-backup-disk); this only mounts it), or copy the file from your Mac:

```bash
scp ~/Downloads/<file>.tar.age <user>@rechnungen.local:
```

4. Get the private key onto the machine. It must not be stored on the server for good, so copy it to `/dev/shm` (memory, gone
   after a reboot). Run this on your Mac:

```bash
scp ~/rechnungen-backup.key <user>@rechnungen.local:/dev/shm/
```

5. Restore on the new machine. `AGE_IDENTITY` names the key file; without it the script asks for the path (then type
   `/dev/shm/rechnungen-backup.key`):

```bash
cd ~/invoice-generator/deploy/self-hosted && AGE_IDENTITY=/dev/shm/rechnungen-backup.key scripts/restore /mnt/backup/rechnungen/<file>.tar.age
```

   (Use `~/<file>.tar.age` if you copied the file from your Mac.)

6. Remove the key again:

```bash
rm /dev/shm/rechnungen-backup.key
```

7. Set up the nightly backup timer and, if you use one, the external disk again ([Backups](#backups): the systemd units and the
   `/etc/fstab` line are not part of a backup). If `BACKUP_DIR` in the restored `.env` points to a path that does not exist on
   this machine, create it or change `BACKUP_DIR`.

## Update

```bash
cd ~/invoice-generator/deploy/self-hosted && scripts/update
```

The script makes a backup, runs `git pull --ff-only`, builds the new app image, applies database migrations, restarts the
app and finally removes old app images and build cache older than a week (never anything a running container uses, and never
data). If the backup, the pull or the build fails, the running app and the database stay as they were. The build takes several
minutes on a Pi; the old app keeps serving meanwhile. Use `scripts/update --no-pull` if you updated the code yourself.

If a database migration fails (after the build), the script stops with an error. Each migration file is applied in one
transaction, so the failing file changed nothing, and the old app keeps running. **Do not restore the backup** in this case:
the database is intact, and restoring would only throw away work. Note the error message, get the problem fixed (a new version
of the repository), and run `scripts/update` again; it continues with the migrations that are still missing. Restoring is for
lost or damaged data, not for a failed update.

Operating system updates are separate (`sudo apt update && sudo apt full-upgrade`, then `sudo reboot` now and then). The
Docker images in `compose.yml` have fixed versions; they change only with a new version of this repository.

## Moving to another machine

For example from the Pi to an x86-64 mini PC, or onto a new SD card while the old one still works.

1. **Stop entering data** in the app, then make a final backup on the old machine and note where it is (the line
   `Backup written: ...` shows the full path; `BACKUP_DIR` in `.env` decides where, for example `/mnt/backup/rechnungen`):

```bash
cd ~/invoice-generator/deploy/self-hosted && scripts/backup
```

2. Copy that file to your Mac (use the real path and file name):

```bash
scp <user>@rechnungen.local:/mnt/backup/rechnungen/<file>.tar.age ~/Downloads/
```

3. Check on the Mac that the copy opens with your private key. No output and no error means it is fine:

```bash
age -d -i ~/rechnungen-backup.key ~/Downloads/<file>.tar.age > /dev/null
```

4. Only now switch the old machine off (two servers answering to the same name would confuse the network).
5. On the new machine follow [Restore on a new machine](#restore-on-a-new-machine-or-sd-card), using the file from your Mac
   (the `scp` alternative in its step 3).

The accounts, all invoices and the certificate come along, so your devices need no changes as long as the new machine
answers to the same name (`rechnungen.local`, or the same fixed address).

## Security

- **Nothing is meant to be reachable from the internet.** Do not create port forwards on your router for this machine, and do
  not set it up as an "exposed host" or enable "port sharing" for it.
- **IPv6:** Docker publishes ports 80 and 443 on IPv6 as well, and `ufw` does not filter them. If your router gives the Pi a
  public IPv6 address and lets inbound connections through, the login page would be reachable from the internet. Make sure the
  router's firewall blocks inbound IPv6 connections to home devices (the FRITZ!Box default does; other routers vary, and
  some need a setting).
- The stack publishes only ports 80 and 443 (Caddy). Do not add more `ports:` entries to `compose.yml`.
- **Docker-published ports bypass the `ufw` firewall** (Docker writes its own firewall rules), so `ufw` does not protect
  80/443 here. That is acceptable only because of the router points above. `ufw` still protects everything else on the Pi, such as
  SSH.
- Firewall, with SSH allowed from your home network only. Replace `192.168.1.0/24` with your network (check your router, or
  `ip -4 addr` on the Pi). Allow SSH **before** enabling, or you lock yourself out:

```bash
sudo apt install -y ufw
```

```bash
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp
```

```bash
sudo ufw allow from 192.168.1.0/24 to any port 80,443 proto tcp
```

```bash
sudo ufw enable
```

- SSH with keys only. If you set a public key in Raspberry Pi Imager, switch password logins off:

```bash
echo 'PasswordAuthentication no' | sudo tee /etc/ssh/sshd_config.d/50-no-password.conf
```

```bash
sudo systemctl reload ssh
```

(Test in a second terminal that your key login works before you close the first session.)

- Automatic security updates of the operating system:

```bash
sudo apt install -y unattended-upgrades
```

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
```

- The `.env` file holds all secrets and is readable by your user only. It is contained in every backup; the backups are
  encrypted, the private key is the one thing to protect.
- The app container only receives the "anon" key. The `service_role` key is given to the storage service only, never to the app.
- Anyone who can open a shell on the Pi as your user (or `docker`) can read all data. Use a strong password for the Pi user.

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
8080/8443) and tears it down afterwards, without touching your local Supabase. It needs Docker, `age` and, for the
security lint, internet access.

```bash
deploy/self-hosted/tests/stack-test.sh all
```

`all` runs three fresh stacks one after another and takes about 10 minutes. You can also run a single part: `setup`,
`backup`, `e2e` (Playwright main flow; add `lint` as a second argument to run the security lint on the same stack) or `lint`.
`KEEP=1` leaves the stack running afterwards.

The Playwright test (`npm run test:e2e`) can also be pointed at any running instance with the environment variables
`E2E_BASE_URL`, `E2E_EMAIL` and `E2E_PASSWORD`.

Shell scripts must pass `shellcheck`.
