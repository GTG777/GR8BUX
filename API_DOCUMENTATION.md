# Trading Journal API Documentation

## Base URL
`http://localhost:3000/api`

---

## Authentication Endpoints

### 1. Get Current User
**GET** `/auth/user`

**Headers:**
```
Authorization: Bearer <supabase_jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "user",
    "emailVerified": false,
    "lastSignIn": "2026-03-24T10:00:00Z",
    "createdAt": "2026-03-20T10:00:00Z",
    "updatedAt": "2026-03-20T10:00:00Z"
  }
}
```

---

## Admin Endpoints

### 1. Get All Users (Admin Only)
**GET** `/admin/users`

**Headers:**
```
Authorization: Bearer <admin_jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "displayName": "John Trader",
      "role": "user",
      "emailVerified": false,
      "createdAt": "2026-03-20T10:00:00Z",
      "lastSignIn": "2026-03-24T10:00:00Z"
    }
  ]
}
```

### 2. Update User Role (Admin Only)
**PUT** `/admin/users/:id`

**Headers:**
```
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "role": "manager"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "manager",
    "emailVerified": false,
    "createdAt": "2026-03-20T10:00:00Z",
    "updatedAt": "2026-03-24T10:00:00Z"
  }
}
```

---

## Trade Endpoints

### 1. Get All Trades
**GET** `/trades`

**Query Parameters:**
- `symbol` (optional): Filter by stock symbol (e.g., "AAPL")
- `status` (optional): Filter by status ("open" or "closed")
- `limit` (optional): Records per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Example:**
```bash
curl http://localhost:3000/api/trades?symbol=AAPL&status=closed&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "user-id",
      "type": "stock",
      "symbol": "AAPL",
      "entryDate": "2026-03-20T10:00:00Z",
      "exitDate": "2026-03-21T14:00:00Z",
      "commission": 10,
      "pnl": 150.50,
      "status": "closed",
      "notes": "Breakout trade",
      "tags": ["breakout"],
      "createdAt": "2026-03-20T10:00:00Z",
      "updatedAt": "2026-03-21T14:00:00Z"
    }
  ]
}
```

---

### 2. Create Trade
**POST** `/trades`

**Request Body:**
```json
{
  "type": "stock",
  "symbol": "AAPL",
  "entryDate": "2026-03-20T10:00:00Z",
  "commission": 10,
  "notes": "Long breakout",
  "planNotes": "Entered at support",
  "tags": ["breakout", "technical"],
  "stockData": {
    "quantity": 100,
    "entryPrice": 150.00,
    "exitPrice": 151.50
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "new-uuid",
    "userId": "user-id",
    "type": "stock",
    "symbol": "AAPL",
    ...
  }
}
```

---

### 3. Get Specific Trade
**GET** `/trades/:id`

**Example:**
```bash
curl http://localhost:3000/api/trades/trade-uuid-here
```

**Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

---

### 4. Update Trade
**PUT** `/trades/:id`

**Request Body:**
```json
{
  "exitDate": "2026-03-21T14:00:00Z",
  "exitPrice": 151.50,
  "status": "closed",
  "pnl": 150,
  "notes": "Exited at resistance"
}
```

**Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

---

### 5. Delete Trade
**DELETE** `/trades/:id`

**Response:**
```json
{
  "success": true,
  "data": {}
}
```

---

## Analytics Endpoints

### Get Trade Analytics
**GET** `/trades/analytics`

**Query Parameters:**
- `symbol` (optional): Analyze trades for specific symbol
- `startDate` (optional): Filter trades from date (ISO format)
- `endDate` (optional): Filter trades to date (ISO format)

**Example:**
```bash
curl "http://localhost:3000/api/trades/analytics?symbol=AAPL"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalTrades": 42,
    "totalPnL": 2450.50,
    "winRate": 61.9,
    "avgWinSize": 85.50,
    "avgLossSize": -45.25,
    "largestWin": 350.00,
    "largestLoss": -200.00,
    "consecutiveWins": 4,
    "consecutiveLosses": 1,
    "profitFactor": 2.31,
    "riskRewardRatio": 1.89,
    "maxDrawdown": 850.00,
    "byStrategy": {
      "breakout": {
        "name": "breakout",
        "totalTrades": 15,
        "wins": 10,
        "losses": 5,
        "winRate": 66.67,
        "totalPnL": 1250.00
      }
    },
    "bySymbol": {
      "AAPL": {
        "symbol": "AAPL",
        "totalTrades": 10,
        "wins": 7,
        "losses": 3,
        "totalPnL": 650.00,
        "avgPnL": 65.00
      }
    },
    "byPeriod": {
      "2026-03-20": {
        "period": "2026-03-20",
        "trades": 3,
        "pnl": 250.50
      }
    }
  }
}
```

---

## Greeks Calculator Endpoint

### Calculate Option Greeks
**POST** `/greeks/calculate`

**Request Body:**
```json
{
  "optionType": "call",
  "spotPrice": 150.00,
  "strikePrice": 155.00,
  "timeToExpiration": 0.25,
  "volatility": 0.25,
  "riskFreeRate": 0.05,
  "dividendYield": 0.02,
  "quantity": 2
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "greeks": {
      "delta": 68.50,
      "gamma": 3.45,
      "theta": -45.20,
      "vega": 125.80,
      "rho": 85.00,
      "premium": 3650.00
    },
    "inputs": {
      "optionType": "call",
      "quantity": 2,
      "spotPrice": 150.00,
      "strikePrice": 155.00,
      "timeToExpirationDays": 91,
      "volatility": "25.00%",
      "riskFreeRate": "5.00%"
    }
  }
}
```

**Parameters:**
- `optionType`: "call" or "put"
- `spotPrice`: Current stock price
- `strikePrice`: Option strike price
- `timeToExpiration`: Years until expiration (0.25 = 3 months)
- `volatility`: Annualized volatility (0.25 = 25%)
- `riskFreeRate` (optional): Risk-free rate (default 0.05 = 5%)
- `dividendYield` (optional): Annual dividend yield (default 0)
- `quantity` (optional): Number of contracts (default 1)

---

## Option Trade Request Format

For option trades, use this structure:

```json
{
  "type": "option",
  "symbol": "AAPL",
  "entryDate": "2026-03-20T10:00:00Z",
  "commission": 25,
  "notes": "Call spread on earnings",
  "tags": ["spread", "earnings"],
  "optionData": {
    "strategy": "call spread",
    "totalPremium": 150.00,
    "totalCost": 200.00,
    "legs": [
      {
        "symbol": "AAPL",
        "type": "call",
        "strikePrice": 150.00,
        "expirationDate": "2026-04-17",
        "direction": "long",
        "quantity": 1,
        "entryPrice": 3.50,
        "exitPrice": 5.00,
        "greeks": {
          "delta": 0.68,
          "gamma": 0.045,
          "theta": -0.052,
          "vega": 0.125,
          "rho": 0.085
        }
      },
      {
        "symbol": "AAPL",
        "type": "call",
        "strikePrice": 155.00,
        "expirationDate": "2026-04-17",
        "direction": "short",
        "quantity": 1,
        "entryPrice": 1.20,
        "exitPrice": 2.00,
        "greeks": {
          "delta": 0.35,
          "gamma": 0.025,
          "theta": -0.028,
          "vega": 0.065,
          "rho": 0.045
        }
      }
    ]
  }
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

**Common Status Codes:**
- `200`: Success
- `201`: Created
- `400`: Bad request
- `404`: Not found
- `405`: Method not allowed
- `500`: Server error

---

## Quick Testing

You can test these endpoints using curl or Postman:

```bash
# Get all trades
curl http://localhost:3000/api/trades

# Create a new trade
curl -X POST http://localhost:3000/api/trades \
  -H "Content-Type: application/json" \
  -d '{
    "type": "stock",
    "symbol": "AAPL",
    "entryDate": "2026-03-20T10:00:00Z",
    "commission": 10,
    "stockData": {
      "quantity": 100,
      "entryPrice": 150.00
    }
  }'

# Calculate Greeks
curl -X POST http://localhost:3000/api/greeks/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "optionType": "call",
    "spotPrice": 150,
    "strikePrice": 155,
    "timeToExpiration": 0.25,
    "volatility": 0.25
  }'
```

---

## Next Steps

1. ✅ Trade CRUD endpoints created
2. ✅ Analytics endpoint created
3. ✅ Greeks calculator enhanced
4. 🔲 Build frontend components
5. 🔲 Connect components to APIs
6. 🔲 Build news/community features
