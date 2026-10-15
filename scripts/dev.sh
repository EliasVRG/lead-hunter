#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting Lead Hunter dev environment..."

# Start infra
echo "📦 Starting Docker services..."
docker compose up -d
echo "✅ PostgreSQL, Redis, n8n ready"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "📥 Installing dependencies..."
  npm install
fi

# Copy .env if missing
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "⚠️  Created .env from .env.example — edit it with your keys"
fi

# Start all apps
echo "🔄 Starting API + Worker..."
npm run dev
