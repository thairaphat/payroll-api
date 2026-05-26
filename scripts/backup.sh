#!/bin/bash
set -e

BACKUP_DIR="/opt/payroll/backups/mariadb"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/payroll_${TIMESTAMP}.sql.gz"
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

# Load root password from production env
source /opt/payroll/.env.production

docker exec payroll-mariadb \
  mysqldump --single-transaction --routines --triggers \
  -u root -p"${MARIADB_ROOT_PASSWORD}" chaiyade_dms \
  | gzip > "$BACKUP_FILE"

echo "✓ Backup created: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

# Rotate: delete dumps older than KEEP_DAYS
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${KEEP_DAYS} -delete
echo "✓ Old backups rotated (kept last ${KEEP_DAYS} days)"

# Optional: rclone off-site copy (uncomment after configuring rclone)
# rclone copy "$BACKUP_FILE" remote:payroll-backups/
