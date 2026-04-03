# syntax=docker/dockerfile:1
# Build front and back independently (no root workspaces required).

FROM node:20-alpine AS builder
WORKDIR /app

COPY back/package*.json back/
RUN cd back && npm install

COPY front/package*.json front/
RUN cd front && npm install

COPY back/ back/
COPY front/ front/

RUN cd front && npm run build
RUN cd back && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat

COPY --from=builder /app/back/package.json ./back/package.json
COPY --from=builder /app/back/node_modules ./back/node_modules
COPY --from=builder /app/back/dist ./back/dist
COPY --from=builder /app/back/prisma ./back/prisma

COPY --from=builder /app/front/dist ./front/dist

EXPOSE 3000
ENV PORT=3000

CMD ["sh", "-c", "cd back && npx prisma migrate deploy && cd .. && exec node back/dist/index.js"]
