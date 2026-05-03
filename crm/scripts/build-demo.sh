#!/usr/bin/env bash
# Builds a static-exported demo of LeoCRM.
#
# Why the file shuffle? Next.js' `output: 'export'` does not support API
# Routes or Middleware. Our app has both. For the demo we temporarily move
# them out of the source tree, run the export, and put them back.
#
# All API calls in client code go through src/lib/client.ts which dispatches
# to the localStorage-backed demo router when NEXT_PUBLIC_DEMO_MODE=1.

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP="$ROOT/.demo-backup"

cleanup() {
  if [ -d "$BACKUP/api" ]; then
    rm -rf "$ROOT/src/app/api"
    mv "$BACKUP/api" "$ROOT/src/app/api"
  fi
  if [ -f "$BACKUP/middleware.ts" ]; then
    mv "$BACKUP/middleware.ts" "$ROOT/src/middleware.ts"
  fi
  rm -rf "$BACKUP"
}
trap cleanup EXIT

rm -rf "$BACKUP"
mkdir -p "$BACKUP"

[ -d "$ROOT/src/app/api" ] && mv "$ROOT/src/app/api" "$BACKUP/api"
[ -f "$ROOT/src/middleware.ts" ] && mv "$ROOT/src/middleware.ts" "$BACKUP/middleware.ts"

cd "$ROOT"

DEMO_BUILD=1 \
NEXT_PUBLIC_DEMO_MODE=1 \
NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/LeoCRM}" \
NEXTAUTH_SECRET=demo-not-used \
NEXTAUTH_URL=http://localhost:3000 \
GOOGLE_CLIENT_ID=demo \
GOOGLE_CLIENT_SECRET=demo \
  npx next build

# Add a no-jekyll marker so GH Pages serves _next/* correctly
touch "$ROOT/out/.nojekyll"

echo "Demo export written to $ROOT/out"
