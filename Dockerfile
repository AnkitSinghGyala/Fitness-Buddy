FROM node:20-bookworm-slim

# Busting Render cache

WORKDIR /app
ENV NODE_ENV=production
ENV BUST_CACHE=1

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["npm", "start"]
