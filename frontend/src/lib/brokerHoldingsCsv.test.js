import { describe, expect, test } from 'vitest';
import { BrokerHoldingsCsvError, parseBrokerHoldingsCsv } from './brokerHoldingsCsv.js';

describe('parseBrokerHoldingsCsv', () => {
  test('parses direct export rows, quoted names, and explicit ETF evidence', () => {
    const csv = [
      'Symbol,Name,Quantity,Average Price,Asset Type',
      'RELIANCE,"Reliance, Industries",2,2500,',
      'NIFTYBEES,"Nifty 50 ETF",3,200,ETF',
    ].join('\n');

    expect(parseBrokerHoldingsCsv(csv)).toEqual([
      { asset_type: 'STOCK', symbol: 'RELIANCE', name: 'Reliance, Industries', quantity: '2', buyPrice: '2500' },
      { asset_type: 'ETF', symbol: 'NIFTYBEES', name: 'Nifty 50 ETF', quantity: '3', buyPrice: '200' },
    ]);
  });

  test('supports the direct export Instrument header and Product evidence', () => {
    expect(parseBrokerHoldingsCsv([
      'Trading Symbol,Instrument,Quantity,Average Price,Product',
      'HDFCBANK,HDFC Bank,2,1500,',
      'NIFTYBEES,Nifty BeES,1,200,ETF',
    ].join('\n'))).toEqual([
      { asset_type: 'STOCK', symbol: 'HDFCBANK', name: 'HDFC Bank', quantity: '2', buyPrice: '1500' },
      { asset_type: 'ETF', symbol: 'NIFTYBEES', name: 'Nifty BeES', quantity: '1', buyPrice: '200' },
    ]);
  });

  test('rejects a funds ledger without holdings headers', () => {
    expect(() => parseBrokerHoldingsCsv('Date,Particulars,Debit,Credit\n2026-01-01,Salary,0,100000'))
      .toThrow(/holdings export|tradebook|ledger/i);
  });

  test('rejects tradebooks even when they include holdings-like columns', () => {
    expect(() => parseBrokerHoldingsCsv('Trade Date,Symbol,Quantity,Average Price,Trade Type\n2026-09-20,ABC,2,100,BUY'))
      .toThrow(/tradebook|ledger/i);
  });

  test('accepts BOM, aliases, quoted commas, and escaped quotes', () => {
    const csv = '\ufeffTrading Symbol,Qty,Avg Cost,Security Type,Name\nNSE:INFY,1,"1,000.50",STOCK,"A ""quoted"", name"';
    expect(parseBrokerHoldingsCsv(csv)).toEqual([
      { asset_type: 'STOCK', symbol: 'INFY', name: 'A "quoted", name', quantity: '1', buyPrice: '1000.5' },
    ]);
  });

  test('normalizes exchange suffixes and defaults name to symbol', () => {
    expect(parseBrokerHoldingsCsv('Ticker,Available Quantity,Buy Average\nRELIANCE.NS,1.5,10'))
      .toEqual([{ asset_type: 'STOCK', symbol: 'RELIANCE', name: 'RELIANCE', quantity: '1.5', buyPrice: '10' }]);
  });

  test('consolidates duplicate rows using weighted average price', () => {
    expect(parseBrokerHoldingsCsv('Symbol,Quantity,Average Price\nTCS,2,100.01\nTCS,1,100.04'))
      .toEqual([{ asset_type: 'STOCK', symbol: 'TCS', name: 'TCS', quantity: '3', buyPrice: '100.02' }]);
  });

  test('supports every requested header alias', () => {
    const cases = [
      ['Symbol', 'Quantity', 'Average Price'],
      ['Trading Symbol', 'Qty', 'Avg Price'],
      ['Tradingsymbol', 'Available Quantity', 'Average Cost'],
      ['Ticker', 'Net Quantity', 'Avg Cost'],
      ['Ticker', 'Net Qty', 'Buy Average'],
    ];
    for (const [symbol, quantity, price] of cases) {
      expect(parseBrokerHoldingsCsv(`${symbol},${quantity},${price}\nABC,1,10`)[0].symbol).toBe('ABC');
    }
  });

  test('infers mutual funds, MF rows, and the BEES ETF convention', () => {
    expect(parseBrokerHoldingsCsv([
      'Symbol,Name,Quantity,Average Price,Category',
      'ABC,Index Mutual Fund,1,10,',
      'DEF,Direct plan,1,10,MF',
      'NIFTYBEES,Nifty,1,10,',
    ].join('\n')).map((row) => row.asset_type)).toEqual(['MUTUAL_FUND', 'MUTUAL_FUND', 'ETF']);
  });

  test('rejects invalid quantities, malformed prices, and conflicting asset types', () => {
    expect(() => parseBrokerHoldingsCsv('Symbol,Quantity,Average Price\nABC,0,1')).toThrow(/quantity/i);
    expect(() => parseBrokerHoldingsCsv('Symbol,Quantity,Average Price\nABC,1,not-money')).toThrow(/price|amount/i);
    expect(() => parseBrokerHoldingsCsv('Symbol,Quantity,Average Price,Type\nABC,1,1,ETF\nABC,1,1,STOCK'))
      .toThrow(/conflicting.*asset/i);
    expect(() => parseBrokerHoldingsCsv('Symbol,Quantity,Average Price\nABC,Infinity,1')).toThrow(/quantity/i);
    expect(() => parseBrokerHoldingsCsv('Symbol,Quantity,Average Price\nABC,1,90071992547410')).toThrow(/price|amount|safe/i);
    expect(() => parseBrokerHoldingsCsv('Symbol,Quantity,Average Price\nABC,9007199254740993,1')).toThrow(/quantity.*safe/i);
  });

  test('weights duplicate decimal quantities and rejects malformed CSV quotes', () => {
    expect(parseBrokerHoldingsCsv('Symbol,Quantity,Average Price\nABC,0.5,100\nABC,1.5,104'))
      .toEqual([{ asset_type: 'STOCK', symbol: 'ABC', name: 'ABC', quantity: '2', buyPrice: '103' }]);
    expect(() => parseBrokerHoldingsCsv('Symbol,Quantity,Average Price\nABC,1,1"oops')).toThrow(/malformed/i);
    expect(() => parseBrokerHoldingsCsv('Symbol,Quantity,Average Price\nABC,1,"1"oops')).toThrow(/malformed/i);
  });

  test('rejects files larger than 1 MiB and more than 1,000 data rows', () => {
    const base = 'Symbol,Quantity,Average Price\nABC,1,1';
    const exactLimit = base + '\n'.repeat(1024 * 1024 - new TextEncoder().encode(base).byteLength);
    expect(new TextEncoder().encode(exactLimit).byteLength).toBe(1024 * 1024);
    expect(parseBrokerHoldingsCsv(exactLimit)).toEqual([{ asset_type: 'STOCK', symbol: 'ABC', name: 'ABC', quantity: '1', buyPrice: '1' }]);
    expect(() => parseBrokerHoldingsCsv(`${exactLimit}X`))
      .toThrow(BrokerHoldingsCsvError);
    const rows = ['Symbol,Quantity,Average Price'];
    for (let i = 0; i < 1001; i += 1) rows.push(`S${i},1,1`);
    expect(() => parseBrokerHoldingsCsv(rows.join('\n'))).toThrow(/1,000|1000|rows/i);
  });
});
