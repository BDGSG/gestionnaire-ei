# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
ENV NODE_ENV=development
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app

# Install backend dependencies
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/src ./src

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create uploads directory
RUN mkdir -p uploads

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]
