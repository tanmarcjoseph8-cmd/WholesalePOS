# Installation Guide

## Requirements

- Node.js 22 or newer
- pnpm 11 or newer
- Docker Desktop
- PostgreSQL 17 when not using Docker

## Local Setup

```bash
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Use strong JWT secrets before running outside a local development machine.
