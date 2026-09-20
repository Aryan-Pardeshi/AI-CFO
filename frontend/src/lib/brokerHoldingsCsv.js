import { rupeesToPaise } from './money.js';

const MAX_BYTES = 1024 * 1024;
const MAX_ROWS = 1000;
const MAX_QUANTITY_SIGNIFICANT_DIGITS = 15;
const TRADEBOOK_HEADERS = new Set([
  'tradedate', 'transactiondate', 'orderdate', 'tradetype', 'transactiontype',
  'buysell', 'buyorsell', 'side', 'orderid', 'tradeid', 'transactionid', 'debit', 'credit',
]);

export class BrokerHoldingsCsvError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BrokerHoldingsCsvError';
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let quoteClosed = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; }
        else { quoted = false; quoteClosed = true; }
      } else cell += char;
    } else if (quoteClosed) {
      if (char !== ',' && char !== '\n' && char !== '\r') throw new BrokerHoldingsCsvError('Malformed CSV: characters after closing quote');
      if (char === ',') {
        row.push(cell); cell = ''; quoteClosed = false;
      } else {
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell); cell = ''; quoteClosed = false;
        if (row.some((value) => value.trim() !== '')) rows.push(row);
        row = [];
      }
    } else if (char === '"') {
      if (cell !== '') throw new BrokerHoldingsCsvError('Malformed CSV: quote inside unquoted field');
      quoted = true;
    } else if (char === ',') {
      row.push(cell); cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new BrokerHoldingsCsvError('Malformed CSV: unterminated quoted field');
  if (cell !== '' || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim() !== '')) rows.push(row);
  }
  return rows;
}

function headerKey(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanSymbol(value) {
  const symbol = String(value ?? '').trim().toUpperCase();
  return symbol.replace(/^(?:NSE|BSE):/, '').replace(/\.NS$/, '').trim();
}

function decimalQuantity(value) {
  const raw = String(value ?? '').trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new BrokerHoldingsCsvError('Invalid quantity');
  const [whole, fraction = ''] = raw.split('.');
  const digits = BigInt(`${whole}${fraction}`);
  if (digits <= 0n) throw new BrokerHoldingsCsvError('Quantity must be positive');
  return { digits, scale: fraction.length };
}

function assertQuantityCanBeSubmitted(quantity) {
  const digits = quantityString(quantity).replace('.', '').replace(/^0+/, '');
  if (digits.length > MAX_QUANTITY_SIGNIFICANT_DIGITS) {
    throw new BrokerHoldingsCsvError('Quantity is too large or precise to submit safely');
  }
}

export function parseSafeHoldingQuantity(value) {
  const quantity = decimalQuantity(value);
  assertQuantityCanBeSubmitted(quantity);
  const numeric = Number(quantityString(quantity));
  if (!Number.isFinite(numeric) || numeric <= 0) throw new BrokerHoldingsCsvError('Quantity must be positive');
  return numeric;
}

function addQuantities(a, b) {
  const scale = Math.max(a.scale, b.scale);
  return { digits: a.digits * (10n ** BigInt(scale - a.scale)) + b.digits * (10n ** BigInt(scale - b.scale)), scale };
}

function quantityString(q) {
  const base = 10n ** BigInt(q.scale);
  const whole = q.digits / base;
  if (q.scale === 0) return String(whole);
  const fraction = String(q.digits % base).padStart(q.scale, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function canonicalPrice(paise) {
  const rupees = paise / 100n;
  const cents = paise % 100n;
  return cents ? `${rupees}.${String(cents).padStart(2, '0').replace(/0$/, '')}` : String(rupees);
}

function inferAssetType(values, symbol) {
  const evidence = values.map((v) => String(v ?? '').trim().toUpperCase()).join(' ');
  if (/\bMUTUAL\s*FUND\b|\bMF\b/.test(evidence)) return 'MUTUAL_FUND';
  if (/\bETF\b/.test(evidence) || /BEES$/.test(symbol)) return 'ETF';
  return 'STOCK';
}

function findColumn(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(headerKey(header)));
}

export function parseBrokerHoldingsCsv(input) {
  if (typeof input !== 'string') throw new BrokerHoldingsCsvError('CSV text must be a UTF-8 string');
  if (new TextEncoder().encode(input).byteLength > MAX_BYTES) throw new BrokerHoldingsCsvError('CSV exceeds the 1 MiB size limit');
  const rows = parseCsv(input.replace(/^\uFEFF/, ''));
  if (!rows.length) throw new BrokerHoldingsCsvError('CSV is empty');
  const headers = rows[0];
  if (headers.some((header) => TRADEBOOK_HEADERS.has(headerKey(header)))) {
    throw new BrokerHoldingsCsvError('Tradebooks and funds ledgers cannot establish current holdings');
  }
  const symbolIndex = findColumn(headers, ['symbol', 'tradingsymbol', 'ticker']);
  const quantityIndex = findColumn(headers, ['quantity', 'qty', 'availablequantity', 'netquantity', 'netqty']);
  const priceIndex = findColumn(headers, ['averageprice', 'avgprice', 'averagecost', 'avgcost', 'buyaverage']);
  if (symbolIndex < 0 || quantityIndex < 0 || priceIndex < 0) {
    throw new BrokerHoldingsCsvError('This is not a holdings export: symbol, quantity, and average price columns are required');
  }
  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_ROWS) throw new BrokerHoldingsCsvError('Holdings CSV cannot contain more than 1,000 data rows');
  const merged = new Map();
  for (const values of dataRows) {
    const symbol = cleanSymbol(values[symbolIndex]);
    if (!symbol) throw new BrokerHoldingsCsvError('Holding symbol is required');
    const quantity = decimalQuantity(values[quantityIndex]);
    assertQuantityCanBeSubmitted(quantity);
    let pricePaise;
    try { pricePaise = rupeesToPaise(values[priceIndex]); } catch { throw new BrokerHoldingsCsvError('Invalid average price'); }
    if (!Number.isSafeInteger(pricePaise)) throw new BrokerHoldingsCsvError('Average price is outside the safe money range');
    const asset_type = inferAssetType(values, symbol);
    const nameIndex = headers.findIndex((h) => /^(?:name|securityname|instrumentname|instrument)$/i.test(String(h).trim().replace(/\s+/g, '')));
    const name = String(values[nameIndex] ?? '').trim() || symbol;
    const key = symbol;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { asset_type, symbol, name, quantity, totalPaise: quantity.digits * BigInt(pricePaise), quantityScale: quantity.scale });
      continue;
    }
    if (existing.asset_type !== asset_type) throw new BrokerHoldingsCsvError(`Conflicting asset types for ${symbol}`);
    const combined = addQuantities(existing.quantity, quantity);
    const scaleFactor = combined.scale - quantity.scale;
    const existingNumerator = existing.totalPaise * (10n ** BigInt(combined.scale - existing.quantityScale));
    const newNumerator = BigInt(pricePaise) * quantity.digits * (10n ** BigInt(scaleFactor));
    existing.quantity = combined;
    existing.quantityScale = combined.scale;
    existing.totalPaise = existingNumerator + newNumerator;
  }
  return [...merged.values()].map((item) => {
    const denominator = item.quantity.digits;
    const averagePaise = (item.totalPaise + denominator / 2n) / denominator;
    return { asset_type: item.asset_type, symbol: item.symbol, name: item.name, quantity: quantityString(item.quantity), buyPrice: canonicalPrice(averagePaise) };
  });
}
