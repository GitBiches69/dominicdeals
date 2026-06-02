# Deploy Dominic Deals

This app needs a real backend so the Best Buy API key stays private. Render is the easiest fit for the current code.

## 1. Push the app to GitHub

Create a private GitHub repo and upload this folder. Do not upload `.env`; it is ignored by `.gitignore`.

If GitHub shows the app files inside a top-level folder named `you-know-about-the-bestbuy-deal`, keep `rootDir: you-know-about-the-bestbuy-deal` in `render.yaml`. If GitHub shows `package.json` directly on the repo's first page, remove the `rootDir` line.

## 2. Create the Render service

1. Go to https://dashboard.render.com/
2. Choose **New** -> **Blueprint** if you want to use `render.yaml`, or **New** -> **Web Service** for manual setup.
3. Connect the GitHub repo.
4. If using manual setup:
   - Runtime: `Node`
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/api/status`
5. Add this environment variable in Render:

```text
BESTBUY_API_KEY=your_key_here
```

Optional V3 notification variables:

```text
RESEND_API_KEY=your_resend_key
NOTIFY_FROM_EMAIL=alerts@dominicdeals.online

TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_FROM_NUMBER=+15551234567
```

Without these, accounts and alert history still work, but notifications are reported as not configured.

Penny Watch background scanning is controlled by:

```text
AUTO_PENNY_SCAN=true
PENNY_SCAN_MINUTES=5
```

The background scan only sends real alerts when `BESTBUY_API_KEY` exists and at least one account has notification settings saved.

V3 stores accounts, phone numbers, and alert history in the app's local `data/` folder. On Render's free web service filesystem, that data may reset on redeploy/restart. For permanent hosted accounts, add a Render disk or move the data to a database before sharing it widely.

## 3. Add the custom domain

In Render, open the service settings and add:

```text
dominicdeals.online
www.dominicdeals.online
```

Then update DNS where `dominicdeals.online` is managed.

For Namecheap-style DNS:

```text
Type: A
Host: @
Value: 216.24.57.1
TTL: 1 min or Automatic

Type: CNAME
Host: www
Value: your-render-service.onrender.com
TTL: 1 min or Automatic
```

Keep your Zoho `MX`, `TXT`, `SPF`, and `DKIM` email records. The web records above should not replace your email records.

## 4. Verify

Return to Render's custom domain screen and click **Verify**. HTTPS is created automatically after DNS validates.
