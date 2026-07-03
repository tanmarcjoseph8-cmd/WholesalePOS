FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY backend/package.json backend/package.json
RUN pnpm install --filter @wholesalepos/backend --frozen-lockfile=false
COPY backend backend
RUN pnpm --filter @wholesalepos/backend build
EXPOSE 4000
CMD ["pnpm", "--filter", "@wholesalepos/backend", "start"]
