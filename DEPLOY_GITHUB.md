# Deploying Fitness Buddy with GitHub

This guide covers how to deploy the Fitness Buddy application using GitHub. Because this application relies on a **SQLite database** (`data/db.sqlite`) and local file storage for sessions, it requires a deployment environment with a **persistent file system** (or persistent volume).

This means you cannot deploy this app (in its current form) to serverless environments (like Vercel, AWS Lambda) or ephemeral containers (like Heroku without add-ons) without losing your database on every restart. 

Here are the recommended ways to deploy this application using your GitHub repository.

## Option 1: Platform as a Service (PaaS) via GitHub Integration

The easiest way to deploy is using a PaaS provider that connects directly to your GitHub repository, builds the app, and provides persistent storage. Recommended platforms: **Render**, **Railway**, or **Fly.io**.

### Example: Deploying to Render

1. Push your code to a GitHub repository.
2. Sign up for [Render](https://render.com/) and link your GitHub account.
3. Click **New +** and select **Web Service**.
4. Select your Fitness Buddy GitHub repository.
5. **Configuration**:
   - **Environment**: `Docker` (Render will automatically detect the `Dockerfile`) or `Node`.
   - **Build Command** (if Node): `npm install`
   - **Start Command** (if Node): `npm start`
6. **Persistent Disk** (Crucial for SQLite):
   - Scroll down to **Advanced** -> **Disks**.
   - Click **Add Disk**.
   - **Name**: `fitness-data`
   - **Mount Path**: `/app/data`
   - **Size**: 1 GB (or as needed)
7. **Environment Variables**:
   Add the variables required for production (see `README.md`), such as:
   - `NODE_ENV=production`
   - `SESSION_SECRET=your-secure-secret-key`
   - `APP_URL=https://your-app-name.onrender.com`
   - `ALLOWED_ORIGINS=https://your-app-name.onrender.com`
   - `DB_PATH=/app/data/db.sqlite`
   - `OPENROUTER_API_KEY=your-api-key` (optional)
8. Click **Create Web Service**. Render will now automatically deploy your app every time you push to GitHub.

## Option 2: Deploying to a VPS using GitHub Actions

If you have your own server (VPS on DigitalOcean, AWS EC2, Linode, etc.), you can use **GitHub Actions** to automatically build and deploy via SSH and Docker.

### 1. Prepare your VPS
Ensure your server has **Docker** and **Docker Compose** installed.

### 2. Add GitHub Secrets
Go to your GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions** and add the following secrets:
- `VPS_HOST`: Your server's IP address.
- `VPS_USERNAME`: Your SSH username (e.g., `root` or `ubuntu`).
- `VPS_SSH_KEY`: Your private SSH key to access the server.
- `PRODUCTION_ENV`: The contents of your `.env` file for production.

### 3. Create a GitHub Actions Workflow
Create a file in your repository at `.github/workflows/deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        env:
          ENV_FILE: ${{ secrets.PRODUCTION_ENV }}
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USERNAME }}
          key: ${{ secrets.VPS_SSH_KEY }}
          envs: ENV_FILE
          script: |
            # Create app directory if it doesn't exist
            mkdir -p /opt/fitness-buddy
            cd /opt/fitness-buddy
            
            # Write the .env file from GitHub Secrets
            echo "$ENV_FILE" > .env
            
            # Clone or pull latest code
            if [ -d ".git" ]; then
              git pull origin main
            else
              git clone https://github.com/${{ github.repository }}.git .
            fi
            
            # Create data directory for SQLite persistence
            mkdir -p data
            
            # Build and run the Docker container
            docker build -t fitness-buddy .
            docker stop fitness-buddy-app || true
            docker rm fitness-buddy-app || true
            
            # Run with persistent volume mounted
            docker run -d \
              --name fitness-buddy-app \
              --env-file .env \
              -p 3000:3000 \
              -v $(pwd)/data:/app/data \
              --restart unless-stopped \
              fitness-buddy
```

With this setup, every time you push code to the `main` branch, GitHub Actions will SSH into your server, pull the latest code, build a new Docker image, and restart the container while preserving your SQLite database in the `/opt/fitness-buddy/data` folder.

## Best Practices for GitHub Deployment

- **Never commit `.env` files**: Ensure `.env` is in your `.gitignore` file.
- **Use GitHub Secrets**: Always store sensitive credentials (API keys, session secrets, SSH keys) in GitHub Secrets, never in plain text in your code.
- **Database Backups**: If using a VPS, set up a cron job on your server to periodically back up the `data/db.sqlite` file, as GitHub Actions will not back it up for you.
