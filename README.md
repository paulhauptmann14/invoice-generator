# Rechnungen (_invoice-generator_)

[![CI](https://github.com/paulhauptmann14/invoice-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/paulhauptmann14/invoice-generator/actions/workflows/ci.yml)

Self-hosted invoicing for small German businesses, run with Docker on a Raspberry Pi in your home network.

"Rechnungen" is a web app with a German interface for writing invoices, keeping customers and articles, and exporting
invoices as PDF and Word files. It runs on a Raspberry Pi or another small Linux machine (Next.js app, self-hosted Supabase
for database, accounts and files, Caddy for HTTPS) and is meant to stay in the home network: nothing is reachable from the
internet. The repository is called `invoice-generator`; inside the app it is "Rechnungen".

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Install](#install)
- [Usage](#usage)
- [Operations](#operations)
- [Security](#security)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Invoices** with a live PDF preview while writing, positions from the article list or free text, VAT of 19, 7 or 0 %,
  a service date or period and an optional due date.
- **Export** as PDF (archived with the invoice) or as an editable Word file. Browsers that support it (Chrome, Edge) ask
  where to save the file.
- **E-invoice (ZUGFeRD):** optionally, the exported PDF is a ZUGFeRD / Factur-X invoice in the profile EN 16931: a
  PDF/A-3 with the invoice data as embedded XML, for invoices to businesses. 0 % lines are reported as zero rated (VAT
  category Z); exemptions such as § 19 UStG or reverse charge are not supported yet.
- **Layouts:** "Briefpapier" (like your own letterhead, default), "Klassisch", "Kompakt" and "Modern", with logo, fonts,
  colors, margins and a DIN 5008 address field for window envelopes.
- **Numbering** with several number ranges per business (for example `G1/26` for invoices, `GU1/26` for vouchers).
- **Customers and articles** to pick from while writing; archived instead of deleted.
- **Several businesses per account**, each with its own customers, articles, invoices, numbers, settings and files.
- **Runs at home:** HTTPS with its own certificate authority, scripts for update, backup (optionally encrypted) and restore,
  and a move to another machine by backup and restore.

## Requirements

- 64-bit Linux, for example Raspberry Pi OS (64-bit) on a Raspberry Pi 5 with 8 GB
- Docker with the Compose plugin, usable without `sudo`
- `git` and `openssl`
- Ports 80 and 443 free
- A name for the machine that your devices can resolve, for example `raspberrypi.local`

## Install

```bash
git clone https://github.com/paulhauptmann14/invoice-generator.git ~/docker/invoice-generator
```

```bash
cd ~/docker/invoice-generator/deploy/self-hosted && scripts/setup
```

The setup asks for the name the app is reached at (it suggests the machine's own name, for example `raspberrypi.local`;
keep it unless your router resolves another one) and creates all secrets in `deploy/self-hosted/.env`. The first build takes
several minutes on a Pi. If it stops with "did not become healthy", see
[Troubleshooting](deploy/self-hosted/README.md#troubleshooting).

## Usage

1. Open `https://<name>` (for example `https://raspberrypi.local`) and continue past the certificate warning. To get rid of
   the warning, [trust the certificate](deploy/self-hosted/README.md#trust-the-certificate) once per device.
2. Choose **"Konto anlegen"** and create your account (password of at least 12 characters), then name your first business.
3. Fill in **Einstellungen → Firma**: export stays locked until the company details required on an invoice are complete.
4. Optionally upload a logo and choose a layout under **Einstellungen → Erscheinungsbild**.
5. Write the first invoice under **Rechnungen → Neue Rechnung** and export it as PDF.

Further businesses are added from the business switcher at the top left ("Neuer Betrieb …").

## Operations

Everyday commands run in `~/docker/invoice-generator/deploy/self-hosted`:

| Command | What it does |
|---|---|
| `scripts/status` | Containers, disk space, backups |
| `scripts/update` | Back up, pull the new version, rebuild, migrate, restart |
| `scripts/backup` | Backup now |
| `scripts/set-password <email>` | New password for an account |

Automatic backups are **off** until you turn them on; `update` and `restore` still save a local copy first. Certificates,
registration, backups, restore, going back after a bad update, moving to another machine and troubleshooting are described in
the [operations guide](deploy/self-hosted/README.md).

## Security

- Home network only: do not forward ports on your router and do not put the app behind a tunnel.
- Everyone who can reach the app can create an account while registration is on; each account only sees its own businesses.
  [Switch registration off](deploy/self-hosted/README.md#registration) once your accounts exist.
- Every business is separated in the database itself (row-level security), not only in the app.
- `.env` holds all secrets and is part of every backup: [encrypt backups](deploy/self-hosted/README.md#turn-on-backups) that
  leave the house.

Found a security problem? Please report it privately through
[GitHub security advisories](https://github.com/paulhauptmann14/invoice-generator/security/advisories/new) instead of a
public issue.

## Development

### Tech stack

Next.js 16 (App Router, React 19, TypeScript), Tailwind CSS 4 with shadcn/ui components, Supabase (Postgres with row-level
security, Auth, Storage), react-pdf and docx for the documents, Vitest, Playwright and pgTAP for tests.

| Path | Contents |
|---|---|
| `src/app` | Routes: pages, API routes, layouts |
| `src/features` | Feature modules (invoices, customers, articles, settings, documents, tenants, auth) |
| `src/components` | Shared UI components |
| `src/lib` | Domain logic, auth, Supabase clients, security headers |
| `supabase` | Migrations, database tests, local seed data |
| `deploy/self-hosted` | Docker Compose stack, Caddy, operation scripts, stack test |

### Local setup

Needs Node.js 24 (as in the Docker image) and Docker. The Supabase CLI is a dev dependency.

```bash
npm install
```

```bash
npm run db:start
```

```bash
npm run dev
```

Open http://localhost:3000 and sign in as `dev@invoice.localhost` with the password `lokales-dev-passwort-123` (local seed
data from `supabase/seed.sql`, owner of two example businesses; `stranger@invoice.localhost` has no business). Supabase
Studio runs at http://127.0.0.1:54323, test e-mails such as "Passwort vergessen" arrive in Mailpit at http://127.0.0.1:54324.

`npm run db:reset` wipes the local data and applies migrations and seed again; `npx supabase migration up` applies only new
migrations and keeps the data.

### Checks

| Command | What it runs |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run test:integration` | Integration tests against the local Supabase |
| `npm run db:test` | Database tests (pgTAP) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build |

GitHub Actions runs all of them, plus `npm audit --omit=dev` and ShellCheck for the deployment scripts, on every push to
`main` and every pull request ([`ci.yml`](.github/workflows/ci.yml)).

Packages are pinned to exact versions (`.npmrc`). Dependabot opens one grouped pull request per month for minor and patch
updates of npm packages and GitHub Actions ([`dependabot.yml`](.github/dependabot.yml)); major versions are updated by hand.
The Supabase images of the self-hosted stack are updated by hand too, followed by the stack test.

### Stack test

`deploy/self-hosted/tests/stack-test.sh` runs the real Compose stack under its own project name (`rechnungen-test`, ports
8080/8443) and tears it down afterwards, without touching your local Supabase. It needs Docker, `age` and internet access
for the Supabase security lint.

```bash
deploy/self-hosted/tests/stack-test.sh all
```

`all` runs setup, backup and restore, update, the Playwright main flow and the security lint on fresh stacks (about 10
minutes). Single parts: `setup`, `backup`, `e2e` (add `lint` as a second argument to lint the same stack) or `lint`.
`KEEP=1` leaves the stack running. The Playwright test (`npm run test:e2e`) also runs against any instance with
`E2E_BASE_URL`, `E2E_EMAIL` and `E2E_PASSWORD` (plus `E2E_REGISTRATION=on` when registration is open).

Note: the update part removes unused Docker images and build cache on the machine it runs on.

## Contributing

This is a personal project for one household and its businesses. Questions and bug reports are welcome as
[issues](https://github.com/paulhauptmann14/invoice-generator/issues). Code in the repository is English, everything users
see is German; shell scripts must pass ShellCheck.

## License

No license has been chosen yet. Without one, the default copyright applies: all rights reserved by the author.
