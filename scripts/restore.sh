#!/bin/bash
# Usage: ./restore.sh backups/mariadb/payroll_20250518_020000.sql.gz
set -e

BACKUP_FILE="$1"
if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: file not found: $BACKUP_FILE"
  exit 1
fi

# Load root password from production env
source /opt/payroll/.env.production

echo "WARNING: This will OVERWRITE the current database with: $BACKUP_FILE"
echo "Press Ctrl+C within 5 seconds to cancel..."
sleep 5

gunzip -c "$BACKUP_FILE" | docker exec -i payroll-mariadb \
  mysql -u root -p"${MARIADB_ROOT_PASSWORD}" chaiyade_dms

echo "✓ Restore complete from: $BACKUP_FILE"
