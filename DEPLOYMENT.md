# Deployment Guide for SportSRC Live Streaming App

This application is ready for production hosting. It consists of a **Node.js/Express backend proxy** (serving APIs to bypass CORS) and a **Single Page Application (SPA) frontend** served statically.

---

## 🚀 Recommended Deployment Options

Here are the simplest and most common platforms for deploying this Node.js application:

### Option A: Render (Recommended - Free Tier available)
1. Sign in to [Render](https://render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository.
4. Set the following settings:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Go to the **Environment** tab and add the Environment Variables (see [Environment Variables](#environment-variables) section below).
6. Click **Deploy Web Service**.

### Option B: Railway (Fastest deployment)
1. Sign in to [Railway](https://railway.app/).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Go to the service **Variables** tab and add the Environment Variables.
4. Railway will automatically detect the `package.json` start script and deploy the application.

### Option C: Heroku
1. Sign in to Heroku and click **New** -> **Create new app**.
2. Connect your Git repository or deploy via Heroku CLI.
3. Go to the **Settings** tab -> **Reveal Config Vars** to add your environment variables.
4. Deploy the branch. Heroku will automatically run the `start` script.

---

## 🔑 Environment Variables

To make sure your live data works, you **MUST** configure these environment variables in your hosting dashboard:

| Variable | Description | Recommended Value |
| :--- | :--- | :--- |
| `SPORTSRC_API_BASE` | The base URL of the streaming API | `https://api.sportsrc.org/` |
| `SPORTSRC_KEY_1` | First backup API Key | `d69fd24b135ab1496edf433bee6092cf` |
| `SPORTSRC_KEY_2` | Second backup API Key | `39033471315a92133134448699dec0fd` |

*Note: The `PORT` variable is set automatically by modern cloud hosts (Render, Heroku, Railway, etc.), and the application is configured to bind to it dynamically.*

---

## 🛠️ Production Ready Features Implemented

1. **Dynamic Port Binding**: The backend listening port is configured as `process.env.PORT || 3000` to bind to the port assigned by your hosting server.
2. **Flexible Paths**: The frontend dynamically resolves its URL base path (`window.APP_BASE_PATH`), meaning it will work perfectly whether hosted on a main domain (e.g. `https://mysite.com`) or a subfolder (e.g. `https://mysite.com/sports-app/`).
3. **CORS Proxying**: The Express server acts as a proxy for the SportSRC API, ensuring you do not experience browser CORS errors in production.
4. **Resilient Fallbacks**: If the backend proxy server is unreachable or disabled, the frontend dynamically falls back to direct API requests using client-side rotation keys or structured demo data so the page never breaks.
5. **Ignore File Created**: A `.gitignore` file has been added to exclude local development assets (`node_modules`, local `.env` secrets) from being uploaded to production.
