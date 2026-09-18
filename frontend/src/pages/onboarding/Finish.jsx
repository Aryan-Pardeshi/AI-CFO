import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { updateProfile } from '../../lib/api.js';

const Finish = ({ goBack }) => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function finish() {
    setSaving(true);
    setFormError('');
    try {
      await updateProfile({ onboarded: true, onboarding_step: 8 });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setFormError(err?.message || 'Could not finish onboarding');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {formError && <div style={{ color: 'var(--error-color)', marginBottom: '1rem', fontSize: '0.875rem' }}>{formError}</div>}
      <div style={{ textAlign: 'center' }}>
        <h3>You&apos;re all set</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Finish onboarding to see your dashboard.</p>
        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="outline" onClick={goBack}>Back</Button>
          <Button onClick={finish} disabled={saving}>{saving ? 'Finishing…' : 'Finish'}</Button>
        </div>
      </div>
    </>
  );
};

export default Finish;
