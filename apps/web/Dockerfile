FROM node:24.11.0-slim AS builder
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY apps/web/.env.schema ./apps/web/.env.schema
RUN bun install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN cd apps/web && bun run build
# Varlock's preload is a runtime dependency outside Next's traced ENV accessor.
RUN node -e "const fs=require('node:fs'),path=require('node:path'); const source=fs.realpathSync('node_modules/varlock'); fs.cpSync(source,'/runtime/node_modules/varlock',{recursive:true,dereference:true}); const helpers=path.join(path.dirname(source),'@varlock'); if(fs.existsSync(helpers))fs.cpSync(helpers,'/runtime/node_modules/@varlock',{recursive:true,dereference:true}); fs.mkdirSync('/runtime/node_modules/.bin',{recursive:true}); fs.symlinkSync('../varlock/bin/cli.js','/runtime/node_modules/.bin/varlock');"

FROM node:24.11.0-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=node:node /app/apps/web/.env.schema ./apps/web/.env.schema
COPY --from=builder --chown=node:node /runtime/node_modules/ ./node_modules/
WORKDIR /app/apps/web
USER node
EXPOSE 3001
CMD ["node", "--import", "varlock/auto-load", "server.js"]
