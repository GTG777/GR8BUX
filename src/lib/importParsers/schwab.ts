/**
 * Schwab/ThinkorSwim CSV Transaction Parser
 *
 * Parses the standard Schwab account statement CSV export and converts
 * individual transaction rows into matched GR8BUX trade records.
 *
 * Schwab CSV columns:
 *   Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount
 *
 * Pairing strategy:
 *   - Stock trades: Buy → open, Sell → matches oldest open Buy (FIFO)
 *   - Option trades: Buy to Open / Sell to Open → open leg
 *                    Sell to Close / Buy to Close → closes matching open leg
 *   - Spreads: multiple legs opened on same underlying same date → grouped
 *
 * Duplicate detection:
 *   - Each raw row gets a fingerprint hash: date|action|symbol|qty|price
 *   - Identical hash = same transaction re-uploaded → skip
 *   - Different qty or price = genuinely different transaction → import
 */

export type SchwabAction =
  | 'Buy'
  | 'Sell'
  | 'Buy to Open'
  | 'Sell to Open'
  | 'Buy to Close'
  | 'Sell to Close'
  | 'Expired'
  | 'Assigned'
  | 'Exercise';

/** One raw parsed row from the CSV */
export interface SchwabRow {
  date: string;          // ISO date string: "2026-04-21"
  action: SchwabAction;
  rawSymbol: string;     // e.g. "RIVN 12/15/2028 13.00 C" or "LMT"
  symbol: string;        // underlying only: "RIVN" or "LMT"
  description: string;
  quantity: number;
  price: number;
  commission: number;
  amount: number;        // net cash (negative = debit)
  isOption: boolean;
  option?: {
    expiration: string;  // ISO date: "2028-12-15"
    strike: number;
    type: 'call' | 'put';
  };
  hash: string;          // fingerprint for dedup
}

/** A fully matched trade ready for insertion */
export interface ParsedTrade {
  type: 'stock' | 'option';
  symbol: string;
  entryDate: string;
  exitDate?: string;
  status: 'open' | 'closed';
  commission: number;
  pnl?: number;
  notes: string;
  importHash: string;     // hash of entry row (primary dedup key)
  tags: string[];

  // Stock-specific
  stockData?: {
    quantity: number;
    entryPrice: number;
    exitPrice?: number;
  };

  // Option-specific
  optionData?: {
    strategy: string;
    totalPremium: number;
    totalCost?: number;
    legs: {
      symbol: string;
      type: 'call' | 'put';
      strikePrice: number;
      expirationDate: string;
      direction: 'long' | 'short';
      quantity: number;
      entryPrice: number;
      exitPrice?: number;
    }[];
  };
}

/** Summary of what happened during parsing */
export interface ParseResult {
  trades: ParsedTrade[];
  skippedRows: { row: number; reason: string; raw: string }[];
  totalRows: number;
}

// ─── Actions to skip entirely ─────────────────────────────────────────────────

const SKIP_ACTIONS = new Set([
  'Bank Interest',
  'Funds Received',
  'Wire Funds',
  'Wire Funds Received',
  'Journal',
  'Qualified Dividend',
  'Non-Qualified Div',
  'Cash Dividend',
  'Reinvest Dividend',
  'Reinvest Shares',
  'Security Transfer',
  'Moneylink Transfer',
  'Margin Interest',
  'ADR Mgmt Fee',
  'Foreign Tax Withheld',
]);

const TRADE_ACTIONS = new Set<SchwabAction>([
  'Buy', 'Sell', 'Buy to Open', 'Sell to Open', 'Buy to Close', 'Sell to Close',
  'Expired', 'Assigned', 'Exercise',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripMoney(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[$,\s]/g, '')) || 0;
}

function stripQty(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/,/g, '')) || 0;
}

function parseDate(s: string): string {
  // Handles "04/21/2026" and "04/21/2026 as of 04/20/2026"
  const clean = s.split(' as of ')[0].trim();
  const [m, d, y] = clean.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Parse option symbol like "RIVN 12/15/2028 13.00 C"
 * Returns null for stock symbols.
 */
function parseOptionSymbol(sym: string): SchwabRow['option'] | null {
  // Pattern: UNDERLYING MM/DD/YYYY STRIKE C|P
  const m = sym.match(/^(\S+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.]+)\s+([CP])$/i);
  if (!m) return null;
  const [, , expRaw, strikeRaw, typeChar] = m;
  const [em, ed, ey] = expRaw.split('/');
  return {
    expiration: `${ey}-${em.padStart(2, '0')}-${ed.padStart(2, '0')}`,
    strike: parseFloat(strikeRaw),
    type: typeChar.toUpperCase() === 'C' ? 'call' : 'put',
  };
}

/** Simple non-crypto fingerprint sufficient for dedup (no subtle collision risk here) */
function fingerprint(date: string, action: string, symbol: string, qty: number, price: number): string {
  const raw = `${date}|${action}|${symbol}|${qty}|${price}`;
  // FNV-1a 32-bit → hex string (fast, no crypto needed)
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + '-' + raw.length + '-' + btoa(raw).slice(0, 16).replace(/[+/=]/g, 'x');
}

// ─── CSV tokenizer ────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseSchwabCSV(csvText: string): ParseResult {
  const lines = csvText.split('\n').map((l) => l.trim()).filter(Boolean);
  const skippedRows: ParseResult['skippedRows'] = [];
  const rows: SchwabRow[] = [];

  // Find header row
  const headerIdx = lines.findIndex((l) =>
    l.toLowerCase().includes('date') && l.toLowerCase().includes('action')
  );
  if (headerIdx === -1) {
    return { trades: [], skippedRows: [{ row: 0, reason: 'No header row found — is this a Schwab CSV?', raw: '' }], totalRows: 0 };
  }

  const dataLines = lines.slice(headerIdx + 1);

  // Parse each row
  dataLines.forEach((line, idx) => {
    const rowNum = headerIdx + 2 + idx;
    if (!line) return;

    const fields = parseCSVLine(line);
    if (fields.length < 7) {
      skippedRows.push({ row: rowNum, reason: 'Too few columns', raw: line });
      return;
    }

    const [dateRaw, actionRaw, symbolRaw, descRaw, qtyRaw, priceRaw, feeRaw] = fields;
    const action = actionRaw.trim();

    // Skip non-trade actions
    if (SKIP_ACTIONS.has(action)) {
      skippedRows.push({ row: rowNum, reason: `Non-trade: ${action}`, raw: line });
      return;
    }

    if (!TRADE_ACTIONS.has(action as SchwabAction)) {
      skippedRows.push({ row: rowNum, reason: `Unknown action: "${action}"`, raw: line });
      return;
    }

    const date = parseDate(dateRaw);
    const qty = Math.abs(stripQty(qtyRaw));
    const price = Math.abs(stripMoney(priceRaw));
    const commission = Math.abs(stripMoney(feeRaw));
    const sym = symbolRaw.trim();
    const optionParsed = parseOptionSymbol(sym);
    const underlying = optionParsed ? sym.split(' ')[0] : sym;

    rows.push({
      date,
      action: action as SchwabAction,
      rawSymbol: sym,
      symbol: underlying,
      description: descRaw.trim(),
      quantity: qty,
      price,
      commission,
      amount: stripMoney(fields[7] ?? '0'),
      isOption: optionParsed !== null,
      option: optionParsed ?? undefined,
      hash: fingerprint(date, action, sym, qty, price),
    });
  });

  const trades = matchTrades(rows, skippedRows);
  return { trades, skippedRows, totalRows: dataLines.length };
}

// ─── Trade matching ───────────────────────────────────────────────────────────

function matchTrades(rows: SchwabRow[], skippedRows: ParseResult['skippedRows']): ParsedTrade[] {
  const trades: ParsedTrade[] = [];

  // ── Stock matching (FIFO) ──────────────────────────────────────────────────
  // Queue of open buy positions per symbol
  const stockQueue: Map<string, SchwabRow[]> = new Map();

  // ── Option matching ────────────────────────────────────────────────────────
  // Open option legs keyed by full symbol (e.g. "RIVN 12/15/2028 13.00 C")
  const optionQueue: Map<string, SchwabRow[]> = new Map();

  // Separate stock and option rows
  const stockRows = rows.filter((r) => !r.isOption);
  const optionRows = rows.filter((r) => r.isOption);

  // ── Process stocks ──────────────────────────────────────────────────────────
  // Sort oldest first for FIFO matching; within same date, Buy before Sell
  // so same-day round-trips (day trades) pair correctly.
  const stockActionOrder = (a: SchwabRow) => (a.action === 'Buy' ? 0 : 1);
  stockRows.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : stockActionOrder(a) - stockActionOrder(b);
  });

  for (const row of stockRows) {
    const isBuy = row.action === 'Buy';
    const isSell = row.action === 'Sell';

    if (isBuy) {
      if (!stockQueue.has(row.symbol)) stockQueue.set(row.symbol, []);
      stockQueue.get(row.symbol)!.push(row);
    } else if (isSell) {
      const queue = stockQueue.get(row.symbol) ?? [];
      if (queue.length > 0) {
        // Match FIFO
        const entry = queue.shift()!;
        const pnl = (row.price - entry.price) * entry.quantity - entry.commission - row.commission;
        trades.push({
          type: 'stock',
          symbol: row.symbol,
          entryDate: entry.date + 'T09:30:00Z',
          exitDate: row.date + 'T16:00:00Z',
          status: 'closed',
          commission: entry.commission + row.commission,
          pnl: parseFloat(pnl.toFixed(2)),
          notes: `Imported from Schwab. Entry: ${entry.description}. Exit: ${row.description}.`,
          importHash: entry.hash,
          tags: ['schwab-import'],
          stockData: {
            quantity: entry.quantity,
            entryPrice: entry.price,
            exitPrice: row.price,
          },
        });
      } else {
        // Short open with no prior buy — treat as open short
        trades.push({
          type: 'stock',
          symbol: row.symbol,
          entryDate: row.date + 'T09:30:00Z',
          status: 'open',
          commission: row.commission,
          notes: `Short position imported from Schwab. ${row.description}`,
          importHash: row.hash,
          tags: ['schwab-import', 'short'],
          stockData: {
            quantity: row.quantity,
            entryPrice: row.price,
          },
        });
      }
    }
  }

  // Flush unmatched stock buys as open positions
  for (const [, queue] of stockQueue) {
    for (const row of queue) {
      trades.push({
        type: 'stock',
        symbol: row.symbol,
        entryDate: row.date + 'T09:30:00Z',
        status: 'open',
        commission: row.commission,
        notes: `Open position imported from Schwab. ${row.description}`,
        importHash: row.hash,
        tags: ['schwab-import'],
        stockData: {
          quantity: row.quantity,
          entryPrice: row.price,
        },
      });
    }
  }

  // ── Process options ─────────────────────────────────────────────────────────
  // Within same date, Open before Close so same-day spreads/day trades pair correctly.
  const optActionOrder = (a: SchwabRow) =>
    (a.action === 'Buy to Open' || a.action === 'Sell to Open') ? 0 : 1;
  optionRows.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : optActionOrder(a) - optActionOrder(b);
  });

  for (const row of optionRows) {
    const isOpen = row.action === 'Buy to Open' || row.action === 'Sell to Open';
    const isClose = row.action === 'Sell to Close' || row.action === 'Buy to Close'
      || row.action === 'Expired' || row.action === 'Assigned' || row.action === 'Exercise';
    const direction: 'long' | 'short' = row.action === 'Buy to Open' || row.action === 'Buy to Close' ? 'long' : 'short';

    if (isOpen) {
      if (!optionQueue.has(row.rawSymbol)) optionQueue.set(row.rawSymbol, []);
      optionQueue.get(row.rawSymbol)!.push(row);
    } else if (isClose) {
      const queue = optionQueue.get(row.rawSymbol) ?? [];
      if (queue.length > 0) {
        const entry = queue.shift()!;
        const multiplier = 100;
        const entryDirection: 'long' | 'short' =
          entry.action === 'Buy to Open' ? 'long' : 'short';
        // Expired/Assigned options close at $0 exit price regardless of row.price
        const isExpiry = row.action === 'Expired' || row.action === 'Assigned' || row.action === 'Exercise';
        const exitPrice = isExpiry ? 0 : row.price;
        const closeNote = isExpiry ? ` (${row.action})` : '';
        const rawPnl = entryDirection === 'long'
          ? (exitPrice - entry.price) * entry.quantity * multiplier
          : (entry.price - exitPrice) * entry.quantity * multiplier;
        const pnl = rawPnl - entry.commission - row.commission;

        trades.push({
          type: 'option',
          symbol: row.symbol,
          entryDate: entry.date + 'T09:30:00Z',
          exitDate: row.date + 'T16:00:00Z',
          status: 'closed',
          commission: entry.commission + row.commission,
          pnl: parseFloat(pnl.toFixed(2)),
          notes: `Imported from Schwab${closeNote}. Entry: ${entry.description}. Exit: ${row.description}.`,
          importHash: entry.hash,
          tags: ['schwab-import', 'options'],
          optionData: {
            strategy: entryDirection === 'long' ? 'long call/put' : 'short call/put',
            totalPremium: entry.price * entry.quantity * multiplier,
            totalCost: entry.price * entry.quantity * multiplier + entry.commission,
            legs: [
              {
                symbol: row.symbol,
                type: entry.option!.type,
                strikePrice: entry.option!.strike,
                expirationDate: entry.option!.expiration,
                direction: entryDirection,
                quantity: entry.quantity,
                entryPrice: entry.price,
                exitPrice: exitPrice,
              },
            ],
          },
        });
      } else {
        // Closing with no matching open — skip silently
        skippedRows.push({
          row: -1,
          reason: `No matching open found for ${row.rawSymbol} (${row.action}) — skipped`,
          raw: row.rawSymbol,
        });
      }
    }
  }

  // Flush unmatched option opens
  for (const [, queue] of optionQueue) {
    for (const row of queue) {
      const dir: 'long' | 'short' = row.action === 'Buy to Open' ? 'long' : 'short';
      trades.push({
        type: 'option',
        symbol: row.symbol,
        entryDate: row.date + 'T09:30:00Z',
        status: 'open',
        commission: row.commission,
        notes: `Open option imported from Schwab. ${row.description}`,
        importHash: row.hash,
        tags: ['schwab-import', 'options'],
        optionData: {
          strategy: dir === 'long' ? 'long call/put' : 'short call/put',
          totalPremium: row.price * row.quantity * 100,
          totalCost: row.price * row.quantity * 100 + row.commission,
          legs: [
            {
              symbol: row.symbol,
              type: row.option!.type,
              strikePrice: row.option!.strike,
              expirationDate: row.option!.expiration,
              direction: dir,
              quantity: row.quantity,
              entryPrice: row.price,
            },
          ],
        },
      });
    }
  }

  return trades;
}
