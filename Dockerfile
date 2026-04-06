# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Set dummy env vars for build (real values come from Secret Manager at runtime)
ENV NEXTAUTH_URL=https://placeholder.run.app
ENV NEXTAUTH_SECRET=build-time-secret
ENV GOOGLE_CLIENT_ID=placeholder
ENV GOOGLE_CLIENT_SECRET=placeholder
ENV FIREBASE_PROJECT_ID=placeholder
ENV FIREBASE_CLIENT_EMAIL=placeholder@placeholder.iam.gserviceaccount.com
ENV FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----"
ENV ALLOWED_DOMAIN=example.com

RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]
