# syntax=docker/dockerfile:1
# Monorepo: Vite front + Express/Prisma back; prod serves front/dist from Node.

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY back/package.json back/
COPY front/package.json front/
COPY packages/shared/package.json packages/shared/

RUN npm install

COPY tsconfig.base.json ./
COPY back/ back/
COPY front/ front/
COPY packages/shared/ packages/shared/

RUN npm run build

# --- Runtime: API + static SPA (hoisted node_modules at repo root)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/back/package.json ./back/package.json
COPY --from=builder /app/back/dist ./back/dist
COPY --from=builder /app/back/prisma ./back/prisma

COPY --from=builder /app/front/package.json ./front/package.json
COPY --from=builder /app/front/dist ./front/dist

EXPOSE 3000
ENV PORT=3000

# Apply migrations, then start (set DATABASE_URL and other env in the platform)
CMD ["sh", "-c", "cd back && npx prisma migrate deploy && cd .. && exec node back/dist/index.js"]
