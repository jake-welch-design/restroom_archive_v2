#!/bin/bash
set -e

SEED_FILE=".local-seed.sql"
D1_DIR=".wrangler/state/v3/d1/miniflare-D1DatabaseObject"

echo "Wiping local D1..."
rm -f "$D1_DIR"/*.sqlite*

echo "Exporting remote D1..."
npx wrangler d1 export restroom-archive-db --remote --output="$SEED_FILE"

echo "Initializing local D1 file..."
mkdir -p "$D1_DIR"
npx wrangler d1 execute restroom-archive-db --local --command="SELECT 1;" > /dev/null

LOCAL_DB=$(find "$D1_DIR" -maxdepth 1 -name "*.sqlite" ! -name "metadata.sqlite" | head -1)
if [ -z "$LOCAL_DB" ]; then
  echo "Error: Could not locate local D1 sqlite file in $D1_DIR"
  exit 1
fi

echo "Applying seed directly via sqlite3 to $LOCAL_DB..."
sqlite3 "$LOCAL_DB" <<EOF
PRAGMA foreign_keys=OFF;
.read $SEED_FILE
EOF

rm -f "$SEED_FILE"
echo "Done. Run 'npm run dev' to start."
