FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts

ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_EVENT_API_BASE
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN

ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_EVENT_API_BASE=$NEXT_PUBLIC_EVENT_API_BASE \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

RUN npx turbo run build --filter=@orbit/web

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ARG WEB_COMMIT_SHA
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 WEB_COMMIT_SHA=$WEB_COMMIT_SHA

RUN groupadd --system orbit && useradd --system --gid orbit orbit
COPY --from=builder --chown=orbit:orbit /app/apps/web/.next/standalone ./
COPY --from=builder --chown=orbit:orbit /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=orbit:orbit /app/apps/web/public ./apps/web/public

USER orbit
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["node", "server.js"]
