import React, { useState } from 'react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { errStyle, inputStyle } from '../../components/onboarding/styles.js';
import { ageFromDob, parseRupeesField, paiseToRupees } from '../../lib/onboarding.js';

const AboutYou = ({ profile, saveAndAdvance, goBack }) => {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [name, setName] = useState(() => profile?.name || '');
  const [dob, setDob] = useState(() => profile?.date_of_birth || '');
  const [employmentType, setEmploymentType] = useState(() => (
    profile?.employment_type !== null && profile?.employment_type !== undefined ? profile.employment_type : ''
  ));
  const [cityTier, setCityTier] = useState(() => (
    profile?.city_tier !== null && profile?.city_tier !== undefined ? profile.city_tier : ''
  ));
  const [dependentsCount, setDependentsCount] = useState(() => (
    profile?.dependents_count !== null && profile?.dependents_count !== undefined ? String(profile.dependents_count) : ''
  ));
  const [existingTermCover, setExistingTermCover] = useState(() => (
    profile?.existing_term_cover_paise !== null && profile?.existing_term_cover_paise !== undefined
      ? paiseToRupees(profile.existing_term_cover_paise) : ''
  ));
  const [existingHealthCover, setExistingHealthCover] = useState(() => (
    profile?.existing_health_cover_paise !== null && profile?.existing_health_cover_paise !== undefined
      ? paiseToRupees(profile.existing_health_cover_paise) : ''
  ));

  async function continueFromStep2() {
    const next = {};
    if (!name.trim()) next.name = 'Name is required';
    const age = ageFromDob(dob);
    if (age === null) next.dob = 'Enter a valid date of birth (YYYY-MM-DD)';
    else if (age < 18 || age > 80) next.dob = 'Age must be between 18 and 80';
    const dependentsEntered = dependentsCount.trim() !== '';
    const dependentsValue = dependentsEntered ? Number(dependentsCount) : null;
    if (dependentsEntered && (!Number.isInteger(dependentsValue) || dependentsValue < 0 || dependentsValue > 20)) {
      next.dependentsCount = 'Dependents must be an integer between 0 and 20';
    }
    const termCover = parseRupeesField('Existing term life cover', existingTermCover, { required: false });
    if (termCover.error) next.existingTermCover = termCover.error;
    const healthCover = parseRupeesField('Existing personal health cover', existingHealthCover, { required: false });
    if (healthCover.error) next.existingHealthCover = healthCover.error;
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await saveAndAdvance(3, {
        name: name.trim(),
        date_of_birth: dob,
        employment_type: employmentType || null,
        city_tier: cityTier || null,
        dependents_count: dependentsValue,
        existing_term_cover_paise: termCover.empty ? null : termCover.paise,
        existing_health_cover_paise: healthCover.empty ? null : healthCover.paise,
      });
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
      <Input label="Full name" id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      {errors.name && <div style={errStyle}>{errors.name}</div>}
      <Input label="Date of birth (YYYY-MM-DD)" id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
      {errors.dob && <div style={errStyle}>{errors.dob}</div>}
      <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1.5rem' }}>
        <h3 style={{ marginTop: 0 }}>A few more details (optional)</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>These improve later insurance and cover estimates.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Employment type</label>
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} style={inputStyle}>
              <option value="">Not answered</option>
              <option value="SALARIED">Salaried</option>
              <option value="SELF_EMPLOYED">Self-employed</option>
              <option value="BUSINESS_OWNER">Business owner</option>
              <option value="STUDENT">Student</option>
              <option value="RETIRED">Retired</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem' }}>City tier</label>
            <select value={cityTier} onChange={(e) => setCityTier(e.target.value)} style={inputStyle}>
              <option value="">Not answered</option>
              <option value="METRO">Metro</option>
              <option value="TIER_2">Tier 2</option>
              <option value="TIER_3">Tier 3</option>
            </select>
          </div>
          <div>
            <Input label="Number of dependents" id="dependentsCount" type="number" min="0" max="20" step="1" value={dependentsCount} onChange={(e) => setDependentsCount(e.target.value)} placeholder="0" />
            {errors.dependentsCount && <div style={errStyle}>{errors.dependentsCount}</div>}
          </div>
          <div>
            <Input label="Existing term life cover (Rs)" id="existingTermCover" value={existingTermCover} onChange={(e) => setExistingTermCover(e.target.value)} placeholder="e.g. 1000000" />
            {errors.existingTermCover && <div style={errStyle}>{errors.existingTermCover}</div>}
          </div>
          <div>
            <Input label="Existing personal health cover (Rs)" id="existingHealthCover" value={existingHealthCover} onChange={(e) => setExistingHealthCover(e.target.value)} placeholder="e.g. 500000" />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '-0.75rem' }}>Personal cover, not employer-provided cover.</p>
            {errors.existingHealthCover && <div style={errStyle}>{errors.existingHealthCover}</div>}
          </div>
        </div>
      </div>
      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="outline" onClick={goBack}>Back</Button>
        <Button onClick={continueFromStep2} disabled={saving}>{saving ? 'Saving…' : 'Continue'}</Button>
      </div>
    </div>
  );
};

export default AboutYou;
