import React, { useState } from 'react';
import Button from '../../components/ui/Button';
import { errStyle } from '../../components/onboarding/styles.js';

const Consent = ({ saveAndAdvance }) => {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [consent, setConsent] = useState(false);

  async function continueFromStep1() {
    if (!consent) {
      setErrors({ consent: 'Please accept the consent to continue' });
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await saveAndAdvance(2, { consent_accepted_at: new Date().toISOString() });
      setErrors({});
    } catch (err) {
      setFormError(err?.message || 'Could not save progress');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {formError && <div style={{ color: 'var(--error-color)', marginBottom: '1rem', fontSize: '0.875rem' }}>{formError}</div>}
      <ul style={{ lineHeight: 1.8, color: 'var(--text-secondary)' }}>
        <li>This is an educational tool, not SEBI-regulated investment advice.</li>
        <li>Your data may be processed by Bedrock models outside India.</li>
        <li>Uploaded statements are AI-read and you review them before anything is saved.</li>
      </ul>
      <label style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', alignItems: 'flex-start' }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>I understand and accept</span>
      </label>
      {errors.consent && <div style={errStyle}>{errors.consent}</div>}
      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={continueFromStep1} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
      </div>
    </div>
  );
};

export default Consent;
