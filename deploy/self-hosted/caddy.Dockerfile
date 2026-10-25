# syntax=docker/dockerfile:1
# Caddy with the DuckDNS DNS provider (module dns.providers.duckdns), built only when .env says TLS_MODE=duckdns (compose.duckdns.yml); the stock image
# has no DNS providers. Same Caddy version as the official image (keep the 2.11.7 here and in compose.yml in step). The build is multi-arch: it runs
# natively on arm64 (Raspberry Pi) and x86-64. The token is never part of the image: Caddy reads it from its environment at run time.
FROM caddy:2.11.7-builder AS builder
RUN xcaddy build v2.11.7 --with github.com/caddy-dns/duckdns@v0.5.0 --output /usr/bin/caddy

FROM caddy:2.11.7-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
