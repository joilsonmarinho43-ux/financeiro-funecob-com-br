# =====================================================================
# FUNecob — build de produção do frontend (Vite + React) servido por nginx
# Fase 1: a VPS executa APENAS o aplicativo web. Nenhum cron, worker,
# Edge Function ou processamento de fila roda neste container.
# =====================================================================

# ---------- Stage 1: build ----------
FROM node:20-alpine AS build

WORKDIR /app

# As variáveis VITE_* precisam existir em TEMPO DE BUILD (Vite as inlineia).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_PORTAL_BASE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_PORTAL_BASE_URL=$VITE_PORTAL_BASE_URL \
    NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- Stage 2: runtime (nginx sem root) ----------
# nginx-unprivileged roda como UID 101 (nginx), sem necessidade de root.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

USER root
ENV TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata curl \
    && cp /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN chown -R 101:101 /usr/share/nginx/html

USER 101

# Única porta exposta. Nenhum serviço interno é publicado.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
