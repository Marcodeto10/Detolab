#!/usr/bin/env bash
# Deploy en un comando: chequea secretos, typecheck, commit y push.
# Vercel deploya solo al recibir el push.
set -e
MSG="${1:-update}"
./scripts/check-secrets.sh
npx tsc --noEmit
git add -A
git commit -m "$MSG" || echo "(nada nuevo para commitear)"
git push
echo "Pusheado. Vercel esta buildeando."
