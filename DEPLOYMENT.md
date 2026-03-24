# Deployment Guide - Trading Journal App (GR8BUX)

## 📋 Pre-Deployment Checklist

- ✅ Code committed and pushed to GitHub
- ✅ Environment variables configured locally
- ✅ Build verified (npm run build succeeded)
- ✅ Netlify configuration created (netlify.toml)
- ⏳ Ready for Netlify deployment

## 🚀 Netlify Deployment Steps

### Step 1: Create Netlify Account & Connect Repository

1. Go to [netlify.com](https://netlify.com)
2. Sign up or log in with your GitHub account
3. Click "New site from Git"
4. Select GitHub as your Git provider
5. Authorize Netlify to access your repositories
6. Select the `GR8BUX` repository

### Step 2: Configure Build Settings

When Netlify detects your repository, it should auto-fill:
- **Build command**: `npm run build`
- **Publish directory**: `.next`
- **Node version**: 18.17.0

These are already configured in `netlify.toml`.

### Step 3: Set Environment Variables

In the Netlify dashboard, go to **Site settings → Environment variables** and add:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

**Where to find these values:**
1. Go to [supabase.com](https://supabase.com)
2. Open your Trading Journal project
3. Go to **Settings → API**
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon (public)** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Step 4: Deploy

1. Click "Deploy site"
2. Netlify will:
   - Pull code from GitHub
   - Install dependencies
   - Build the Next.js app
   - Deploy to Netlify's CDN

Your app will be live at: `https://your-site-name.netlify.app`

---

## 🔗 API Endpoints After Deployment

All your API routes will work automatically:

- **News Aggregation**: `GET /api/news/aggregated?symbols=AAPL,GOOGL`
- **Community Sentiment**: `GET /api/community/sentiment?symbols=AAPL`
- **Technical Analysis**: `GET /api/technical/setups?symbol=AAPL&prices=[...]`
- **Trade Management**: `GET /api/trades`, `POST /api/trades`, etc.
- **Authentication**: `GET /api/auth/user`

---

## ⚙️ Post-Deployment Configuration

### 1. Update Supabase Auth Redirect URLs

In your Supabase project:
1. Go to **Authentication → URL Configuration**
2. Add your Netlify domain to **Redirect URLs**:
   ```
   https://your-site-name.netlify.app/dashboard
   https://your-site-name.netlify.app/auth/signin
   https://your-site-name.netlify.app
   ```

### 2. Enable CORS for External APIs

The app makes requests to:
- Reddit (`reddit.com`)
- StockTwits (`api.stocktwits.com`)
- NewsAPI (`newsapi.org`)
- AllOrigins (CORS proxy)

These are configured to work with the CORS proxy in `newsService.ts`.

---

## 📊 Monitoring & Logging

After deployment, you can:
- View deployment logs in Netlify dashboard
- Check analytics and performance
- Monitor errors via Netlify Functions logs
- View real-time logs: `netlify logs`

---

## 🔄 Continuous Deployment

Every time you push to GitHub:
1. Netlify automatically detects the change
2. Runs the build command
3. Deploys to production (if build succeeds)

To disable auto-deploy:
- Go to **Site settings → Build & deploy → Trigger deploys**

---

## 🐛 Troubleshooting

### Build fails with "Missing environment variables"
- Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in Netlify

### "Cannot POST /api/trades" when creating trades
- Ensure Supabase JWT tokens are valid
- Check that auth headers are being sent correctly

### News/Community APIs returning empty data
- Verify internet connectivity and API rate limits
- Check that external services (Reddit, StockTwits) are accessible
- Review Netlify function logs

### CORS errors on frontend
- All API calls use relative paths, should work automatically
- External data uses AllOrigins CORS proxy

---

## 📚 Resources

- [Netlify Documentation](https://docs.netlify.com/)
- [Next.js on Netlify](https://docs.netlify.com/integrations/frameworks/next-js/)
- [Supabase Auth Setup](https://supabase.com/docs/guides/auth)
- [GR8BUX GitHub Repository](https://github.com/GTG777/GR8BUX)

---

## 🎯 Next Steps After Deployment

1. Test all features in production
2. Monitor analytics and performance
3. Set up error tracking (optional)
4. Share the live URL
5. Gather user feedback

Happy trading! 📈
