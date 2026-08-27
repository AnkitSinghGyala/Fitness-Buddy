FROM node:20-bookworm-slim

# Busting Render cache

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./

# Install build dependencies to compile sqlite3 from source
RUN apt-get update && apt-get install -y python3 make g++ \
    && npm ci --omit=dev --build-from-source=sqlite3 \
    && apt-get purge -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*


COPY . .
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["npm", "start"]
