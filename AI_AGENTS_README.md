# GR8BUX AI Agent System

## Overview

The AI Agent System provides intelligent analysis for trading setups using specialized AI models. Currently implemented:

- **Technical Analyst Agent** - Analyzes chart patterns, technical indicators, and setup quality
- **AI Orchestrator** - Coordinates multiple agents to provide consensus recommendations

## Architecture

```
Setup Data → Orchestrator → Individual Agents → Consensus Recommendation → User Decision
                              ├─ Technical Analyst
                              ├─ Greeks Advisor (coming)
                              ├─ Risk Manager (coming)
                              ├─ Sentiment Analyst (coming)
                              └─ Trade Strategist (coming)
```

## Quick Start

### 1. Environment Setup

Add your Anthropic API key to `.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-...your-key...
```

Optional API key for protecting the `/api/agents/*` endpoints:

```env
GR8BUX_API_KEY=your-secure-key-here
```

### 2. Using the AI Analysis Hook in React

```typescript
import { useAIAnalysis } from '@/hooks/useAIAnalysis';
import AIAdvisorPanel from '@/components/AIAdvisorPanel';

export function MyComponent() {
  const { analysis, isLoading, error, analyzeSetup } = useAIAnalysis();

  const handleAnalyzeSetup = async () => {
    await analyzeSetup({
      symbol: 'AAPL',
      setupType: 'support_bounce',
      currentPrice: 190.5,
      rsi: 32,
      bbLower: 188.2,
      bbMiddle: 192.1,
      bbUpper: 195.9,
      support: 188.0,
      resistance: 195.0,
      priceHigh: 196.5,
      priceLow: 187.2,
      volume: 45000000,
      volatility: 0.18,
      detectedAt: new Date().toISOString(),
    });
  };

  return (
    <div>
      <button onClick={handleAnalyzeSetup}>Analyze Setup</button>
      <AIAdvisorPanel analysis={analysis} isLoading={isLoading} error={error} />
    </div>
  );
}
```

### 3. Direct API Usage

```bash
curl -X POST http://localhost:3000/api/agents/analyze \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "symbol": "TSLA",
    "setupType": "coiling",
    "currentPrice": 240.5,
    "rsi": 45,
    "support": 235.0,
    "resistance": 250.0,
    "detectedAt": "2024-04-15T10:30:00Z",
    "ivRank": 35,
    "hv20": 0.28,
    "delta": 0.65,
    "premium": 3.50
  }'
```

## API Response Schema

```typescript
{
  "setupId": "TSLA_coiling_1713178200000",
  "timestamp": "2024-04-15T10:30:00.000Z",
  "analyses": {
    "technical": {
      "agentType": "technical",
      "symbol": "TSLA",
      "setupType": "coiling",
      "qualityScore": 78,           // 0-100
      "confidence": 0.82,           // 0-1
      "reasoning": "Strong coiling pattern forming...",
      "keySignals": {
        "positive": ["RSI oversold reversal", "Volume compression"],
        "negative": ["Lower support not yet tested"],
        "neutral": []
      },
      "redFlags": ["IV Rank at 35% suggests caution"],
      "recommendation": "BUY",
      "riskRewardRatio": 2.5,
      "targetPrice": 255.0,
      "stopPrice": 232.0,
      "timestamp": "2024-04-15T10:30:00.000Z"
    }
  },
  "consensusRecommendation": {
    "action": "BUY",
    "confidence": 0.82,
    "reasoning": "Technical setup scores 78/100 (82% confidence)...",
    "cautions": ["IV Rank at 35% suggests caution"],
    "nextSteps": [
      "Prepare trade entry with recommended position size",
      "Set stop loss at $232",
      "Define profit targets at resistance levels"
    ]
  }
}
```

## Agent Configuration

### Technical Analyst Agent

Analyzes technical setups for quality and provides recommendations.

**Inputs:**
- Chart patterns (support bounces, breakouts, coiling, etc.)
- Technical indicators (RSI, Bollinger Bands, volatility, volume)
- Price structure (support, resistance, highs, lows)
- Historical price data (optional)

**Outputs:**
- Quality score (0-100)
- Confidence level (0-1)
- Recommendation (STRONG_BUY, BUY, NEUTRAL, WAIT, AVOID)
- Risk/reward ratio
- Target and stop prices
- Key positive/negative signals
- Red flags and cautions

**Special Mode - LEAPS Analysis:**
When `ivRank` and `hv20` are provided, the agent shifts to LEAPS-specific evaluation:
- Focuses on long-term thesis (not short-term bounces)
- Evaluates IV extremes as pricing opportunities
- Considers delta and premium value for multi-month holds

## Integration Examples

### LEAPS Screener Enhancement

Add AI quality scoring to each row in the LEAPS screener:

```typescript
// src/pages/leaps/index.tsx
import { useAIAnalysis } from '@/hooks/useAIAnalysis';
import AIAdvisorPanel from '@/components/AIAdvisorPanel';

export function LeapsScreener() {
  const [selectedRow, setSelectedRow] = useState<ScreenerRow | null>(null);
  const { analysis, analyzeSetup, isLoading, error } = useAIAnalysis();

  const handleRowClick = async (row: ScreenerRow) => {
    setSelectedRow(row);
    await analyzeSetup({
      symbol: row.symbol,
      setupType: 'leaps_opportunity',
      currentPrice: row.price,
      support: row.support,
      resistance: row.resistance,
      ivRank: row.ivr,
      hv20: row.hv20,
      delta: row.bestDelta,
      premium: row.bestPremium,
      detectedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2">
        <table>
          {/* Screener rows with click handlers */}
          <tbody>
            {screenerData.map((row) => (
              <tr 
                key={row.symbol}
                onClick={() => handleRowClick(row)}
                className="cursor-pointer hover:bg-gray-100"
              >
                {/* Columns */}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        {selectedRow && (
          <AIAdvisorPanel 
            analysis={analysis}
            isLoading={isLoading}
            error={error}
            compact={false}
          />
        )}
      </div>
    </div>
  );
}
```

### Pre-Trade Validation

Show AI recommendation before user enters a trade:

```typescript
// In trade entry form
const { analysis, analyzeSetup } = useAIAnalysis();

const handleSetupTypeSelected = async (setupType: string) => {
  await analyzeSetup({
    symbol: formData.symbol,
    setupType: setupType,
    currentPrice: marketData.price,
    rsi: marketData.rsi,
    // ... other fields
  });
};

// In form UI
<AIAdvisorPanel 
  analysis={analysis}
  onTradeClick={() => submitTrade()}
/>
```

## Performance & Caching

The `useAIAnalysis` hook includes built-in caching:

```typescript
// Default: 5-minute cache
const { analyzeSetup } = useAIAnalysis();

// Custom cache duration (10 minutes)
const { analyzeSetup } = useAIAnalysis({ 
  cacheDurationMs: 10 * 60 * 1000 
});

// Disable caching
const { analyzeSetup } = useAIAnalysis({ 
  cacheEnabled: false 
});

// Clear cache manually
const { clearCache } = useAIAnalysis();
clearCache();
```

## Error Handling

```typescript
const { analyzeSetup, error, isLoading } = useAIAnalysis();

try {
  await analyzeSetup(setupData);
} catch (err) {
  if (err.message.includes('rate limit')) {
    // Handle rate limiting
  } else if (err.message.includes('API key')) {
    // Handle auth error
  }
}
```

## Type Definitions

All agent responses are strongly typed:

```typescript
import type { 
  TechnicalAnalysis,
  OrchestratorResponse,
  AgentResponse 
} from '@/types/agents';
```

## Costs

**Anthropic Claude API Usage:**
- ~$0.003-0.01 per analysis (depending on complexity and model)
- Budget estimate: $3-10/month for active user performing 100+ analyses
- Recommended: Set up usage alerts in Anthropic dashboard

## Roadmap

### Phase 1 (Implemented ✅)
- ✅ Technical Analyst Agent
- ✅ API Endpoint
- ✅ React Hook Integration
- ✅ UI Component Display

### Phase 2 (Next)
- 🔲 Greeks Advisor Agent (options strategy optimization)
- 🔲 Risk Manager Agent (position sizing, portfolio hedging)
- 🔲 Sentiment Analyst Agent (news + social + insider)
- 🔲 Trade Strategist Agent (complete trade plans)

### Phase 3
- 🔲 Learning Coach Agent (post-trade analysis)
- 🔲 Setup Scanner (daily scanning for patterns)
- 🔲 Real-time alerts (WebSocket monitoring)
- 🔲 User preference profiles (personalized themes/weights)

## Contributing

To add a new agent:

1. Create agent file in `src/lib/agents/`
2. Extend `Agent` base class
3. Define response type in `src/types/agents.ts`
4. Add to orchestrator in `src/lib/agents/orchestrator.ts`
5. Create API endpoint in `src/pages/api/agents/`
6. Test and document usage

## Troubleshooting

**"API key not configured"**
- Add `ANTHROPIC_API_KEY` to `.env.local`
- Restart development server

**"Rate limit exceeded"**
- Wait 60 seconds before retrying
- Consider reducing analysis frequency or upgrading Anthropic plan

**"Failed to parse agent response"**
- The LLM response wasn't valid JSON
- Check API logs for full response
- Retry or adjust model/temperature settings

**Slow analysis (~10+ seconds)**
- Normal for Opus model (most capable)
- Switch to Sonnet model for faster responses (`claude-3-5-sonnet-20241022`)
- Reduce model `maxTokens` to speed up generation

---

**Last Updated:** April 15, 2026  
**Status:** Production Ready (Technical Analyst), Beta (Orchestration Framework)
