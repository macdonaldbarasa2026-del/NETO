# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all deps (including dev for build)
RUN npm ci

# Copy source
COPY . .

# Build frontend (Vite) + inject SW precache + bundle server
RUN npm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and install only production deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Expose the port Cloudflare Containers routes to
EXPOSE 3000

# Start the bundled server
CMD ["node", "dist/server.cjs"]
