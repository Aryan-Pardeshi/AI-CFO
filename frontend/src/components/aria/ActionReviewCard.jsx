import React, { useState } from 'react';
import { actionRequest, isSafeAction } from '../../lib/ariaActions.js';

export default function ActionReviewCard({ proposal, onComplete, onCancel }) {
  const [state, setState] = useState('idle');
  const confirm = async () => {
    if (!isSafeAction(proposal) || state !== 'idle') return;
    setState('saving');
    try {
      await actionRequest(proposal);
      setState('done');
      onComplete?.();
    } catch (error) {
      setState(error?.status === 409 ? 'stale' : 'error');
    }
  };
  if (!isSafeAction(proposal)) return null;
  return (
    <section className="aria-action-card" aria-label="Review proposed change">
      <p className="aria-action-summary">{proposal.summary}</p>
      <dl>
        {Object.entries(proposal.payload ?? {}).map(([key, value]) => (
          <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
        ))}
      </dl>
      {state === 'stale' && <p role="alert">This changed already. Refresh ARIA and ask again.</p>}
      {state === 'error' && <p role="alert">Could not apply that change. Please try again.</p>}
      {state === 'done' ? <p role="status">Change confirmed.</p> : (
        <div className="aria-action-buttons">
          <button type="button" onClick={confirm} disabled={state === 'saving'}>Confirm</button>
          <button type="button" onClick={onCancel} disabled={state === 'saving'}>Cancel</button>
        </div>
      )}
    </section>
  );
}
