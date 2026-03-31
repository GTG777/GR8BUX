import React, { useState } from 'react';
import axios from 'axios';

interface TechnicalSetup {
  setupType: string;
  confidence: number;
  description: string;
  formation: Record<string, any>;
  entryPrice?: string;
  stopLoss?: string;
  targetPrice?: string;
  riskReward?: string;
}

interface TechnicalSetupsProps {
  symbol: string;
  priceData: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

export const TechnicalSetups: React.FC<TechnicalSetupsProps> = ({ symbol, priceData }) => {
  const [setups, setSetups] = useState<TechnicalSetup[]>([]);
  const [rsi, setRsi] = useState<string | null>(null);
  const [rsiStatus, setRsiStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  React.useEffect(() => {
    analyzeSetups();
  }, [symbol, priceData]);

  const analyzeSetups = async () => {
    if (priceData.length < 20) {
      setError('Need at least 20 price points for analysis');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await axios.post('/api/technical/setups', {
        symbol,
        prices: priceData,
      });

      if (response.data.success) {
        setSetups(response.data.data.setups);
        setRsi(response.data.data.rsi);
        setRsiStatus(response.data.data.rsiStatus);
      } else {
        setError('Failed to analyze setups');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze setups');
    } finally {
      setLoading(false);
    }
  };

  const confidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-100 text-green-800 border-green-300';
    if (confidence >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (confidence >= 40) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  const rsiColor = (status: string) => {
    switch (status) {
      case 'Overbought':
        return 'text-red-600 bg-red-50';
      case 'Oversold':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const setupIcon = (setupType: string) => {
    const type = setupType.toLowerCase();
    if (type.includes('coil')) return '🔄';
    if (type.includes('consol')) return '📊';
    if (type.includes('support') || type.includes('resist')) return '🎯';
    if (type.includes('trend')) return '📈';
    return '⚡';
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Technical Setups - {symbol}</h2>
        <button
          onClick={analyzeSetups}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Analyze
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* RSI Indicator */}
      {rsi && (
        <div className={`border border-b-4 rounded-lg p-4 ${rsiColor(rsiStatus || '')}`}>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-semibold text-gray-700">RSI (14)</p>
              <p className="text-3xl font-bold">{rsi}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Status</p>
              <p className="text-lg font-bold">{rsiStatus}</p>
            </div>
          </div>
          <div className="mt-3 h-2 bg-gray-300 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                parseFloat(rsi) > 70
                  ? 'bg-red-500'
                  : parseFloat(rsi) < 30
                    ? 'bg-green-500'
                    : 'bg-yellow-500'
              }`}
              style={{ width: `${parseFloat(rsi)}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>0</span>
            <span>Overbought (70)</span>
            <span>Oversold (30)</span>
            <span>100</span>
          </div>
        </div>
      )}

      {/* Setups List */}
      <div className="space-y-3">
        {setups.length === 0 ? (
          <p className="text-gray-500">No significant setups detected</p>
        ) : (
          setups.map((setup, idx) => (
            <div
              key={idx}
              className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
            >
              <button
                onClick={() => setExpanded(expanded === String(idx) ? null : String(idx))}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-2xl">{setupIcon(setup.setupType)}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{setup.setupType}</h3>
                      <p className="text-sm text-gray-600">{setup.description}</p>
                    </div>
                  </div>
                </div>

                <div className="text-right ml-4">
                  <div
                    className={`inline-block px-3 py-1 rounded-full font-bold border ${confidenceColor(setup.confidence)}`}
                  >
                    {setup.confidence}% confidence
                  </div>
                </div>

                <span className="ml-2 text-gray-400">
                  {expanded === String(idx) ? '▼' : '▶'}
                </span>
              </button>

              {/* Expanded Details */}
              {expanded === String(idx) && (
                <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-4">
                  {/* Formation Details */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Formation Details</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(setup.formation).map(([key, value]) => (
                        <div key={key} className="bg-white p-2 rounded border border-gray-200">
                          <p className="text-gray-600">{key.replace(/_/g, ' ')}</p>
                          <p className="font-semibold text-gray-900">
                            {typeof value === 'number' ? value.toFixed(2) : String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Price Targets */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Trade Setup</h4>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      {setup.entryPrice && (
                        <div className="bg-blue-50 p-3 rounded border border-blue-200">
                          <p className="text-gray-600 text-xs">Entry Price</p>
                          <p className="text-lg font-bold text-blue-600">${setup.entryPrice}</p>
                        </div>
                      )}
                      {setup.stopLoss && (
                        <div className="bg-red-50 p-3 rounded border border-red-200">
                          <p className="text-gray-600 text-xs">Stop Loss</p>
                          <p className="text-lg font-bold text-red-600">${setup.stopLoss}</p>
                        </div>
                      )}
                      {setup.targetPrice && (
                        <div className="bg-green-50 p-3 rounded border border-green-200">
                          <p className="text-gray-600 text-xs">Target Price</p>
                          <p className="text-lg font-bold text-green-600">${setup.targetPrice}</p>
                        </div>
                      )}
                    </div>

                    {/* Risk/Reward */}
                    {setup.riskReward && (
                      <div className="mt-2 p-3 bg-purple-50 rounded border border-purple-200">
                        <p className="text-gray-600 text-xs">Risk/Reward Ratio</p>
                        <p className="text-lg font-bold text-purple-600">{setup.riskReward}:1</p>
                      </div>
                    )}
                  </div>

                  {/* Note */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <p className="text-xs font-semibold text-yellow-800">⚠️ Disclaimer</p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Technical setups are for educational purposes only. Always conduct your own
                      research and consult with a financial advisor before trading.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Help Text */}
      {setups.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900 font-semibold mb-1">📚 About These Setups</p>
          <ul className="text-xs text-blue-800 space-y-1 ml-4">
            <li>• <strong>Coiling</strong>: Range tightening before breakout</li>
            <li>• <strong>Consolidation</strong>: Price trading sideways between support/resistance</li>
            <li>• <strong>Support/Resistance</strong>: Key price levels where reversals occur</li>
            <li>• <strong>Trend</strong>: Directional momentum (uptrend or downtrend)</li>
          </ul>
        </div>
      )}
    </div>
  );
};
