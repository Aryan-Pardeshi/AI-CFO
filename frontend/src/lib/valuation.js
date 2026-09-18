function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function liveQuoteFor(liveData, ticker) {
  if (!ticker || !liveData || !Object.prototype.hasOwnProperty.call(liveData, ticker)) {
    return null;
  }
  const quote = Number(liveData[ticker]);
  return Number.isFinite(quote) ? quote : null;
}

export function derivePortfolioValuation(portfolio = [], liveData = {}) {
  const rows = portfolio.map((item) => {
    const quantity = numberOrZero(item.quantity);
    const buyPrice = numberOrZero(item.buyPrice);
    const invested = quantity * buyPrice;
    const livePrice = liveQuoteFor(liveData, item.ticker);
    const currentValue = livePrice === null ? null : quantity * livePrice;
    const pnl = currentValue === null ? null : currentValue - invested;
    const returnPct = pnl === null || invested <= 0 ? null : (pnl / invested) * 100;

    return {
      ...item,
      quantity,
      buyPrice,
      invested,
      livePrice,
      currentValue,
      pnl,
      returnPct,
    };
  });

  const quotedRows = rows.filter((row) => row.livePrice !== null);
  const totalInvested = rows.reduce((sum, row) => sum + row.invested, 0);
  const totalCurrentValue = quotedRows.length > 0
    ? quotedRows.reduce((sum, row) => sum + row.currentValue, 0)
    : null;
  const totalPnl = quotedRows.length > 0
    ? quotedRows.reduce((sum, row) => sum + row.pnl, 0)
    : null;
  const quotedInvested = quotedRows.reduce((sum, row) => sum + row.invested, 0);
  const totalPnlPercent = totalPnl === null || quotedInvested <= 0
    ? null
    : (totalPnl / quotedInvested) * 100;
  const bestRow = quotedRows
    .filter((row) => row.returnPct !== null)
    .sort((a, b) => b.returnPct - a.returnPct)[0];

  let quoteState = 'unavailable';
  if (rows.length > 0 && quotedRows.length === rows.length) quoteState = 'complete';
  else if (quotedRows.length > 0) quoteState = 'partial';

  return {
    rows,
    quoteState,
    quotedCount: quotedRows.length,
    missingQuoteCount: rows.length - quotedRows.length,
    totalInvested,
    totalCurrentValue,
    totalPnl,
    totalPnlPercent,
    bestPerformer: bestRow
      ? { ticker: bestRow.ticker || bestRow.name, returnPct: bestRow.returnPct }
      : null,
  };
}
