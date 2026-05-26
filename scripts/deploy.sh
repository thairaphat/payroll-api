#!/bin/bash
set -e
cd /opt/payroll

echo "→ Pulling latest code..."
git pull origin main

echo "→ Building images..."
docker compose build --no-cache backend frontend

echo "→ Applying DB schema..."
docker compose run --rm backend bunx prisma db push

echo "→ Restarting services..."
docker compose up -d --remove-orphans

echo "→ Waiting for services to stabilise..."
sleep 10

docker compose ps

curl -sf https://payroll.yourdomain.com/ && echo "✓ Frontend OK"
curl -sf https://payroll.yourdomain.com/auth/login \
  -X POST -H "Content-Type: application/json" -d '{}' \
  | grep -q "false\|error\|400\|401\|422" && echo "✓ Backend auth OK"

echo "✓ Deploy complete"
