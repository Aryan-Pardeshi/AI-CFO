import { rupeesToPaise } from './money.js';

/**
 * Display-only helpers for the FIRE experience. No financial computation lives
 * here: money arrives as integer paise and is divided by 100 exactly once for
 * display; rates arrive as decimal fractions and are shown as percentages.
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
});

export function formatPaiseINR(paise) {
  if (!Number.isInteger(paise)) {
    throw new Error('paise must be an integer');
  }
  return inrFormatter.format(paise / 100);
}

export function formatRatePct(rate) {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) {
    return 'Not available';
  }
  return `${Math.round(Number(rate) * 1000) / 10}%`;
}

/**
 * The API's implied_withdrawal_rate_pct already arrives as 0–100 (e.g. 4.8),
 * unlike assumption rates which arrive as decimal fractions — so this helper
 * only labels, never rescales.
 */
export function formatWithdrawalPct(pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) {
    return 'Not available';
  }
  return `${Math.round(Number(pct) * 10) / 10}%`;
}

export function formatFireAge(age) {
  if (age === null || age === undefined) {
    return 'Not available';
  }
  return `Age ${age}`;
}

export function formatCoverageMonths(months) {
  if (months === null || months === undefined) {
    return 'Not available';
  }
  return `${Math.round(Number(months) * 10) / 10} months`;
}

/**
 * Shape the two returned curves into chart rows aligned by age.
 * Values convert paise → rupees once; an age missing from one curve stays
 * null on that side — never interpolated or fabricated.
 */
export function buildFireChartRows(requiredCurve, projectedCurve) {
  const byAge = new Map();
  const put = (point, key) => {
    if (point === null || point === undefined) return;
    if (point.age === null || point.age === undefined) return;
    const entry = byAge.get(point.age) || { age: point.age, required: null, projected: null };
    entry[key] =
      point.corpus_paise === null || point.corpus_paise === undefined
        ? null
        : Number(point.corpus_paise) / 100;
    byAge.set(point.age, entry);
  };
  for (const point of requiredCurve || []) put(point, 'required');
  for (const point of projectedCurve || []) put(point, 'projected');
  return [...byAge.values()].sort((a, b) => a.age - b.age);
}

const GOAL_TYPES = ['CAR', 'WEDDING', 'HOUSE_DOWN_PAYMENT', 'EDUCATION', 'TRAVEL', 'OTHER'];

export { GOAL_TYPES };

/**
 * Validate what-if form input in the UI and convert whole rupees to integer
 * paise for the candidate_goal body. Throws with a human-readable message.
 */
export function buildCandidateGoal({ goalType, amountRupees, targetAge }) {
  if (!goalType || !GOAL_TYPES.includes(goalType)) {
    throw new Error('Choose a life-event type.');
  }
  const amountTodayPaise = rupeesToPaise(String(amountRupees ?? '').trim() === '' ? 'invalid' : amountRupees);
  if (amountTodayPaise <= 0) {
    throw new Error('Enter a positive amount greater than zero.');
  }
  const age = Number(targetAge);
  if (!Number.isInteger(age) || age < 18 || age > 91) {
    throw new Error('Enter a sensible target age between 18 and 91.');
  }
  return { goal_type: goalType, amount_today_paise: amountTodayPaise, target_age: age };
}
