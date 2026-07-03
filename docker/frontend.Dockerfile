FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY frontend/package.json frontend/package.json
RUN pnpm install --filter @wholesalepos/frontend --frozen-lockfile=false
COPY frontend frontend
RUN pnpm --filter @wholesalepos/frontend build
EXPOSE 5173
CMD ["pnpm", "--filter", "@wholesalepos/frontend", "dev"]
