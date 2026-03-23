# ===========================
# Super Cartola Manager
# Dockerfile - Production Build
# ===========================

FROM node:20-alpine AS base

# Instalar dependências de sistema para builds nativos (bcryptjs, etc.)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# ===========================
# Stage 1: Instalar dependências
# ===========================
FROM base AS deps

COPY package.json package-lock.json* ./
RUN npm ci --production=false

# ===========================
# Stage 2: Build (TailwindCSS)
# ===========================
FROM deps AS builder

COPY . .
RUN npm run build:css

# Remover devDependencies após build
RUN npm prune --production

# ===========================
# Stage 3: Runtime
# ===========================
FROM node:20-alpine AS runtime

WORKDIR /app

# Usuário não-root para segurança
RUN addgroup -g 1001 -S scm && \
    adduser -S scm -u 1001

# Copiar apenas o necessário do builder
COPY --from=builder --chown=scm:scm /app/node_modules ./node_modules
COPY --from=builder --chown=scm:scm /app/public ./public
COPY --chown=scm:scm package.json ./
COPY --chown=scm:scm index.js ./
COPY --chown=scm:scm config/ ./config/
COPY --chown=scm:scm controllers/ ./controllers/
COPY --chown=scm:scm middleware/ ./middleware/
COPY --chown=scm:scm models/ ./models/
COPY --chown=scm:scm routes/ ./routes/
COPY --chown=scm:scm services/ ./services/
COPY --chown=scm:scm utils/ ./utils/
COPY --chown=scm:scm scripts/ ./scripts/
COPY --chown=scm:scm jobs/ ./jobs/

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER scm

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/app/check-version || exit 1

CMD ["node", "index.js"]
