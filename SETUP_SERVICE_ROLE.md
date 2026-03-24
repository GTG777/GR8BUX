# Setting Up Service Role Key for Trade API Testing

The trade creation endpoint requires the Supabase service role key to bypass Row Level Security (RLS) policies. You have two options:

## Option 1: Add Service Role Key (Recommended)

### Step 1: Get the Service Role Key from Supabase
1. Go to: https://app.supabase.com
2. Navigate to your project (bsqrrbtdvybgqufoanta)
3. Click **"Project Settings"** (bottom left)
4. Click **"API"** tab
5. Look for **"Project API keys"** section
6. Copy the **"service_role"** secret key (it's labeled as "secret" and starts with `eyJ...`)
   - ⚠️ Do NOT use the "anon" key - that's different!

### Step 2: Add to .env.local
Open `.env.local` and find the line:
```
SUPABASE_SERVICE_ROLE_KEY=
```

Paste your service role key:
```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### Step 3: Restart Dev Server
1. Stop the current server (Ctrl+C or kill the terminal)
2. Run: `npm run dev`
3. Test the trade creation API

---

## Option 2: Disable RLS temporarily (Quick Fix)

If you can't access the service role key:

### Step 1: Run the Disable RLS SQL
1. Go to Supabase Project Dashboard
2. Click **"SQL Editor"** (in the left sidebar)
3. Click **"New Query"**
4. Copy and paste the contents of: `supabase/migrations/003_disable_rls_for_testing.sql`
5. Click **"Run"** button (or press Ctrl+Enter)

### Step 2: Restart Dev Server
```
npm run dev
```

### Step 3: Test Trade Creation
The API should now work without the service role key.

### Step 4: Re-enable RLS After Testing
When you're done testing, re-enable RLS by running the commented SQL commands at the bottom of that same file.

---

## Testing the Trade API

Once configured, test with:

```powershell
$body = @{
    type = "stock"
    symbol = "MSFT"
    entryDate = "2024-01-15"
    exitDate = "2024-01-20"
    status = "closed"
    quantity = 100
    entryPrice = 382.38
    exitPrice = 385.00
    commission = 10
    notes = "UAT test"
    planNotes = "Test plan"
    tags = "test,uat"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3003/api/trades" -Method POST -ContentType "application/json" -Body $body
```

Expected response: `201 Created` with trade data

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| `42501: violates row-level security` | Service role key not set or RLS not disabled |
| `400: Could not find 'entry_date'` | API field name mismatch (should be fixed) |
| `Connection timeout` | Dev server not running or URL wrong (should be `localhost:3003`) |

