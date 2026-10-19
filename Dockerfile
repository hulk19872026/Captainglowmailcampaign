# ---------- Stage 1: build the website (frontend) ----------
FROM node:22-slim AS frontend
WORKDIR /app
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci --no-audit --no-fund
COPY frontend/ frontend/
# The frontend shares the repeat-schedule maths with the backend
COPY backend/src/lib/recurrence.ts backend/src/lib/recurrence.ts
RUN cd frontend && npm run build

# ---------- Stage 2: build the server (backend) ----------
FROM node:22-slim AS backend
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm ci --no-audit --no-fund
COPY backend/ backend/
RUN cd backend && npm run build && npm prune --omit=dev

# ---------- Stage 3: slim runtime that serves both ----------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=backend /app/backend/node_modules backend/node_modules
COPY --from=backend /app/backend/dist backend/dist
COPY --from=backend /app/backend/package.json backend/package.json
COPY --from=frontend /app/frontend/dist frontend/dist
ARG RAILWAY_GIT_COMMIT_SHA
ENV GIT_COMMIT=$RAILWAY_GIT_COMMIT_SHA
ENV PORT=3000
EXPOSE 3000
CMD ["node", "backend/dist/index.js"]
