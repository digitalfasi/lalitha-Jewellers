#!/usr/bin/env bash
# Daily backup of DFX Wholesale: the Postgres database and the uploaded photos.
# Writes to deploy/backups/ and keeps the last 14 days. Run by the systemd user
# timer in deploy/systemd/ (see DEPLOY.md), or by hand: ./backup.sh
set -euo pipefail

cd "$(dirname "$0")"
export DOCKER_HOST="${DOCKER_HOST:-unix:///run/user/$(id -u)/docker.sock}"
KEEP_DAYS=14
STAMP="$(date +%Y-%m-%d_%H%M)"
OUT=backups
mkdir -p "$OUT"
chmod 700 "$OUT"

# Database: a consistent snapshot while the app keeps running.
docker compose exec -T db pg_dump -U wholesale --clean --if-exists wholesale | gzip > "$OUT/db_$STAMP.sql.gz.part"
mv "$OUT/db_$STAMP.sql.gz.part" "$OUT/db_$STAMP.sql.gz"

# Photos and logo.
docker compose exec -T api tar -C /data -czf - uploads > "$OUT/uploads_$STAMP.tar.gz.part"
mv "$OUT/uploads_$STAMP.tar.gz.part" "$OUT/uploads_$STAMP.tar.gz"

# Keep two weeks.
find "$OUT" -name 'db_*.sql.gz' -mtime +$KEEP_DAYS -delete
find "$OUT" -name 'uploads_*.tar.gz' -mtime +$KEEP_DAYS -delete

echo "Backup done: $OUT/db_$STAMP.sql.gz ($(du -h "$OUT/db_$STAMP.sql.gz" | cut -f1)), $OUT/uploads_$STAMP.tar.gz"
