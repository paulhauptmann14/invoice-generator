#!/usr/bin/env bash
# HS256 JWT helper (openssl only). Source it; it does not run anything by itself.

b64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

# Prints a JWT for a Supabase role (anon / service_role) signed with the shared secret, valid for ten years.
jwt_hs256() { # jwt_hs256 <role> <secret>
  local role=$1 secret=$2 now header payload signature
  now="$(date +%s)"
  header="$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)"
  payload="$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$role" "$now" "$((now + 315360000))" | b64url)"
  signature="$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$secret" -binary | b64url)"
  printf '%s.%s.%s\n' "$header" "$payload" "$signature"
}
