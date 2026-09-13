#!/usr/bin/env bash
# Falla el build si detecta una key o si vite.config.ts vuelve a inyectar env al cliente.
set -e
fail=0

if grep -rnE "AIza[0-9A-Za-z_-]{30,}" --exclude-dir=node_modules --exclude-dir=dist --exclude=package-lock.json . ; then
  echo "ERROR: hay una API key literal en el codigo."; fail=1
fi

if grep -nE "define:" vite.config.ts | grep -q "" && grep -nE "API_KEY" vite.config.ts ; then
  echo "ERROR: vite.config.ts esta inyectando una API key en el bundle del cliente."; fail=1
fi

if git ls-files --error-unmatch .env >/dev/null 2>&1 ; then
  echo "ERROR: .env esta trackeado por git."; fail=1
fi

if [ "$fail" -eq 0 ]; then echo "Sin secretos expuestos."; fi
exit $fail
