# Deployment Guide - SharkDB

Since **SharkDB** is a zero-dependency static Single Page Application (SPA), it can be hosted globally on any static provider for free. Below are the step-by-step instructions to deploy SharkDB using three popular hosting services.

---

## ⚡ Option 1: One-Click Deploy to Vercel (Recommended)

Vercel provides free, high-performance hosting with automatic SSL and global CDN distribution.

### Step 1: Push Code to GitHub
1. Create a repository on GitHub (e.g., `sharkdb`).
2. Initialize git in your project directory and push the code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for SharkDB"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/sharkdb.git
   git push -u origin main
   ```

### Step 2: Import into Vercel
1. Go to [Vercel](https://vercel.com/) and sign in with GitHub.
2. Click **Add New** -> **Project**.
3. Select your `sharkdb` repository.
4. Leave all settings at their default values (Vercel automatically detects static projects).
5. Click **Deploy**. Your app will be live on a `*.vercel.app` subdomain in under a minute!

*Note: The `vercel.json` file in the root is already configured to handle client-side routing.*

---

## 🌐 Option 2: Deploy to GitHub Pages (Free & Built-in)

GitHub Pages hosts static files directly from a repository.

### Step 1: Configure repository settings
1. Push your code to a public GitHub repository.
2. Open the repository on GitHub.
3. Click on the **Settings** tab.
4. On the left sidebar, click on **Pages**.

### Step 2: Build and Deploy
1. Under **Build and deployment** -> **Source**, select **Deploy from a branch**.
2. Select the `main` (or `master`) branch and directory `/ (root)`.
3. Click **Save**.
4. GitHub will run a workflow. After 1-2 minutes, refresh the page to see your live URL (usually `https://YOUR_USERNAME.github.io/sharkdb/`).

---

## ☁️ Option 3: Deploy to Netlify (Drag & Drop or Git)

Netlify offers high-speed static hosting with a simple Drag & Drop option if you don't want to use Git.

### Method A: Drag & Drop (Zero Git required)
1. Open [Netlify](https://www.netlify.com/) and log in.
2. Go to the **Sites** tab.
3. Scroll to the bottom where it says *"Want to deploy a new site without connecting to Git? Drag and drop your site folder here"*.
4. Drag the entire project folder and drop it into the upload box.
5. It will deploy instantly and provide a custom URL!

### Method B: Git Integration
1. Connect your GitHub repository to Netlify.
2. Netlify will rebuild and redeploy the site automatically every time you push changes to your `main` branch.
