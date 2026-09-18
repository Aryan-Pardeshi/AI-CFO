import React, { useEffect, useRef, useState } from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import demoPortfolio from '../../data/demoPortfolio.json';
import StatementAutofillBox from '../../components/onboarding/StatementAutofillBox';
import { errStyle, inputStyle } from '../../components/onboarding/styles.js';
import { ASSET_TYPE_LABELS, buildFdPayload, buildHoldingPayload, fdHoldingSync, mapHoldingRows, parseRupeesField, paiseToRupees, serverIdOf, holdingRowSync } from '../../lib/onboarding.js';
import { createHolding, deleteHolding, listHoldings, updateHolding } from '../../lib/api.js';

const ASSET_OPTIONS = [{ value: 'STOCK', label: ASSET_TYPE_LABELS.STOCK }, { value: 'ETF', label: ASSET_TYPE_LABELS.ETF }, { value: 'MUTUAL_FUND', label: ASSET_TYPE_LABELS.MUTUAL_FUND }, { value: 'CRYPTO', label: ASSET_TYPE_LABELS.CRYPTO }, { value: 'OTHER', label: ASSET_TYPE_LABELS.OTHER }];

const Holdings = ({ profile, saveAndAdvance, goBack }) => {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [holdingsStatementMsg, setHoldingsStatementMsg] = useState('');
  const [demoMsg, setDemoMsg] = useState('');
  const idRef = useRef(2);
  const [holdings, setHoldings] = useState([{ id: 'holding-1', asset_type: 'STOCK', symbol: '', name: '', quantity: '', buyPrice: '', valueOnly: false, currentValue: '', server_id: null }]);
  const [fdAmount, setFdAmount] = useState('');
  const [fdServerId, setFdServerId] = useState(null);
  const [holdingsEntryMode, setHoldingsEntryMode] = useState('individual');
  const [declaredNetWorth, setDeclaredNetWorth] = useState(() => profile?.declared_net_worth_paise !== null && profile?.declared_net_worth_paise !== undefined ? paiseToRupees(profile.declared_net_worth_paise) : '');
  const [emergencyMonths, setEmergencyMonths] = useState(() => profile?.emergency_fund_target_months !== null && profile?.emergency_fund_target_months !== undefined ? String(profile.emergency_fund_target_months) : '6');

  useEffect(() => {
    let cancelled = false;
    listHoldings()
      .then((items) => {
        if (cancelled || !Array.isArray(items)) return;
        const mapped = mapHoldingRows(items);
        if (mapped.fdAmount !== null) {
          setFdAmount(mapped.fdAmount);
          setFdServerId(mapped.fdServerId);
        }
        if (mapped.holdings) setHoldings(mapped.holdings);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function addHoldingRow() {
    const id = `holding-${idRef.current}`;
    idRef.current += 1;
    setHoldings((prev) => [...prev, { id, asset_type: 'STOCK', symbol: '', name: '', quantity: '', buyPrice: '', valueOnly: false, currentValue: '', server_id: null }]);
  }

  function editHolding(id, field, value) {
    setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  }

  async function removeHoldingRow(id) {
    const row = holdings.find((h) => h.id === id);
    if (row?.server_id) {
      try {
        await deleteHolding(row.server_id);
      } catch (err) {
        setFormError(err?.message || 'Could not delete holding');
        return;
      }
    }
    setHoldings((prev) => {
      const next = prev.filter((h) => h.id !== id);
      if (next.length === 0) {
        const fresh = `holding-${idRef.current}`;
        idRef.current += 1;
        return [{ id: fresh, asset_type: 'STOCK', symbol: '', name: '', quantity: '', buyPrice: '', valueOnly: false, currentValue: '', server_id: null }];
      }
      return next;
    });
  }

  function handleHoldingsAutofill() {
    setHoldingsStatementMsg("Broker statement import isn't available yet - enter your holdings manually");
  }

  async function loadDemoPortfolio() {
    setDemoMsg('');
    setFormError('');
    setSaving(true);
    try {
      for (const holding of demoPortfolio) {
        await createHolding(holding);
      }
      const items = await listHoldings();
      if (!Array.isArray(items)) throw new Error('Could not load demo portfolio');
      const mapped = mapHoldingRows(items);
      if (mapped.fdAmount !== null) {
        setFdAmount(mapped.fdAmount);
        setFdServerId(mapped.fdServerId);
      }
      if (mapped.holdings) setHoldings(mapped.holdings);
      setHoldingsEntryMode('individual');
      setDemoMsg('Demo portfolio loaded - edit or remove any row below, then Continue');
    } catch (err) {
      setFormError(err?.message || 'Could not load demo portfolio');
    } finally {
      setSaving(false);
    }
  }

  async function continueFromStep4() {
    const next = {};
    const em = Number(emergencyMonths);
    if (!Number.isInteger(em) || em < 0 || em > 24) next.emergencyMonths = 'Enter 0–24 months';
    if (holdingsEntryMode === 'total') {
      const total = parseRupeesField('Total current value of your investments, including FDs (Rs)', declaredNetWorth);
      if (total.error) next.declaredNetWorth = total.error;
      if (Object.keys(next).length > 0) {
        setErrors(next);
        return;
      }
      setSaving(true);
      setFormError('');
      try {
        await saveAndAdvance(5, {
          emergency_fund_target_months: em,
          declared_net_worth_paise: total.paise,
        });
        setErrors({});
      } catch (err) {
        setFormError(err?.message || 'Could not save holdings');
      } finally {
        setSaving(false);
      }
      return;
    }
    const toSave = [];
    for (let i = 0; i < holdings.length; i += 1) {
      const h = holdings[i];
      if (holdingRowSync(h) === 'skip') continue;
      if (!h.symbol.trim()) next[`holding_${h.id}_symbol`] = 'Symbol is required (NSE symbol like RELIANCE)';
      else if (/\.ns$/i.test(h.symbol.trim())) next[`holding_${h.id}_symbol`] = 'Use NSE symbol without .NS';
      if (h.valueOnly) {
        const current = parseRupeesField('Current value', h.currentValue);
        if (current.error) next[`holding_${h.id}_value`] = current.error;
        else if (current.paise <= 0) next[`holding_${h.id}_value`] = 'Current value must be positive';
        if (!next[`holding_${h.id}_symbol`] && !next[`holding_${h.id}_value`]) {
          toSave.push({ row: h, qty: 1, paise: current.paise });
        }
      } else {
        const qty = Number(h.quantity);
        if (h.quantity.trim() === '' || !Number.isFinite(qty) || qty <= 0) next[`holding_${h.id}_qty`] = 'Quantity must be positive';
        const bp = parseRupeesField('Average buy price', h.buyPrice);
        if (bp.error) next[`holding_${h.id}_price`] = bp.error;
        if (!next[`holding_${h.id}_symbol`] && !next[`holding_${h.id}_qty`] && !next[`holding_${h.id}_price`]) {
          toSave.push({ row: h, qty, paise: bp.paise });
        }
      }
    }
    const fd = fdAmount.trim() === '' ? { paise: 0, empty: true } : parseRupeesField('Fixed deposits', fdAmount);
    if (fd.error) next.fdAmount = fd.error;
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      for (const { row, qty, paise } of toSave) {
        const payload = buildHoldingPayload({
          assetType: row.asset_type,
          symbol: row.symbol.trim().toUpperCase(),
          name: row.name.trim() || row.symbol.trim().toUpperCase(),
          quantity: qty,
          avgBuyPricePaise: paise,
          manualCurrentValuePaise: row.valueOnly ? paise : (row.server_id ? null : undefined),
        });
        if (row.server_id) {
          await updateHolding(row.server_id, payload);
        } else {
          const created = await createHolding(payload);
          const newId = serverIdOf(created, null);
          setHoldings((prev) => prev.map((x) => (x.id === row.id ? { ...x, server_id: newId } : x)));
        }
      }
      const fdAction = fdHoldingSync({ serverId: fdServerId, paise: fd.paise ?? 0 });
      if (fdAction === 'create') {
        const created = await createHolding(buildFdPayload(fd.paise));
        setFdServerId(serverIdOf(created, null));
      } else if (fdAction === 'update') {
        await updateHolding(fdServerId, buildFdPayload(fd.paise));
      } else if (fdAction === 'delete') {
        await deleteHolding(fdServerId);
        setFdServerId(null);
      }
      await saveAndAdvance(5, { emergency_fund_target_months: em });
      setErrors({});
    } catch (err) {
      setFormError(err?.message || 'Could not save holdings');
    } finally {
      setSaving(false);
    }
  }

  const savedHoldingsCount = holdings.filter((h) => h.server_id).length + (fdServerId ? 1 : 0);

  return (
    <div>
      {formError && <div style={{ color: 'var(--error-color)', marginBottom: '1rem', fontSize: '0.875rem' }}>{formError}</div>}
      <div style={{ marginBottom: '1.5rem' }}><StatementAutofillBox heading="Auto-fill from a broker statement (optional)" helperText="Try importing a holdings or CAS statement to fill these numbers." onClick={handleHoldingsAutofill} message={holdingsStatementMsg} /></div>
      <div role="group" aria-label="How to add investments" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="radio" name="holdings-entry-mode" checked={holdingsEntryMode === 'individual'} onChange={() => setHoldingsEntryMode('individual')} />
          Add holdings individually
        </label>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="radio" name="holdings-entry-mode" checked={holdingsEntryMode === 'total'} onChange={() => setHoldingsEntryMode('total')} />
          Enter a total only
        </label>
        <Button variant="outline" onClick={loadDemoPortfolio} disabled={saving} style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
          Load a demo portfolio
        </Button>
      </div>
      {demoMsg && <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>{demoMsg}</div>}
      {holdingsEntryMode === 'individual' && (
        <>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Use NSE symbols like RELIANCE (no .NS suffix).</p>
          <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead><tr style={{ borderBottom: '2px solid var(--border-color)' }}><th style={{ padding: '0.75rem' }}>Asset Type</th><th style={{ padding: '0.75rem' }}>Symbol</th><th style={{ padding: '0.75rem' }}>Name</th><th style={{ padding: '0.75rem' }}>Value entry</th><th style={{ padding: '0.75rem' }}>Quantity</th><th style={{ padding: '0.75rem' }}>Avg buy price (₹)</th><th style={{ padding: '0.75rem' }}></th></tr></thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <select value={h.asset_type} onChange={(e) => editHolding(h.id, 'asset_type', e.target.value)} style={inputStyle}>
                        {ASSET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input value={h.symbol} onChange={(e) => editHolding(h.id, 'symbol', e.target.value)} placeholder="RELIANCE" style={inputStyle} />
                      {errors[`holding_${h.id}_symbol`] && <div style={errStyle}>{errors[`holding_${h.id}_symbol`]}</div>}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input value={h.name} onChange={(e) => editHolding(h.id, 'name', e.target.value)} placeholder="Reliance Industries" style={inputStyle} />
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem' }}>
                        <input type="checkbox" checked={h.valueOnly} onChange={(e) => editHolding(h.id, 'valueOnly', e.target.checked)} />
                        I only know today&apos;s value
                      </label>
                    </td>
                    {h.valueOnly ? (
                      <td colSpan={2} style={{ padding: '0.5rem' }}>
                        <label htmlFor={`holding-value-${h.id}`} style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Current value (Rs)</label>
                        <input id={`holding-value-${h.id}`} value={h.currentValue} onChange={(e) => editHolding(h.id, 'currentValue', e.target.value)} placeholder="15000" style={inputStyle} />
                        {errors[`holding_${h.id}_value`] && <div style={errStyle}>{errors[`holding_${h.id}_value`]}</div>}
                      </td>
                    ) : (
                      <>
                        <td style={{ padding: '0.5rem' }}>
                          <input value={h.quantity} onChange={(e) => editHolding(h.id, 'quantity', e.target.value)} placeholder="10" style={inputStyle} />
                          {errors[`holding_${h.id}_qty`] && <div style={errStyle}>{errors[`holding_${h.id}_qty`]}</div>}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <input value={h.buyPrice} onChange={(e) => editHolding(h.id, 'buyPrice', e.target.value)} placeholder="1500.25" style={inputStyle} />
                          {errors[`holding_${h.id}_price`] && <div style={errStyle}>{errors[`holding_${h.id}_price`]}</div>}
                        </td>
                      </>
                    )}
                    <td style={{ padding: '0.5rem' }}>
                      <button type="button" onClick={() => removeHoldingRow(h.id)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={addHoldingRow}>+ Add another holding</Button>
          </div>
        </>
      )}
      {holdingsEntryMode === 'total' && (
        <div style={{ marginTop: '1rem' }}>
          <Input label="Total current value of your investments, including FDs (Rs)" id="declaredNetWorth" value={declaredNetWorth} onChange={(e) => setDeclaredNetWorth(e.target.value)} placeholder="e.g. 500000" />
          {errors.declaredNetWorth && <div style={errStyle}>{errors.declaredNetWorth}</div>}
          {savedHoldingsCount > 0 && (
            <div style={{ ...errStyle, color: 'var(--text-secondary)' }}>
              You already have {savedHoldingsCount} saved {savedHoldingsCount === 1 ? 'holding' : 'holdings'}. Saved holdings are used instead of this total — remove them under &quot;Add holdings individually&quot; for this total to count.
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
        {holdingsEntryMode === 'individual' && (
          <div>
            <Input label="Fixed deposits total (₹)" id="fdAmount" value={fdAmount} onChange={(e) => setFdAmount(e.target.value)} placeholder="e.g. 500000" />
            {errors.fdAmount && <div style={errStyle}>{errors.fdAmount}</div>}
          </div>
        )}
        <div>
          <Input label="Emergency fund target (months)" id="emergencyMonths" value={emergencyMonths} onChange={(e) => setEmergencyMonths(e.target.value)} placeholder="6" />
          {errors.emergencyMonths && <div style={errStyle}>{errors.emergencyMonths}</div>}
        </div>
      </div>
      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="outline" onClick={goBack}>Back</Button>
        <Button onClick={continueFromStep4} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
      </div>
    </div>
  );
};

export default Holdings;
