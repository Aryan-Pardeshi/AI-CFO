import { rupeesToPaise } from './money.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value, label) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    throw new Error(`${label} must be a valid ISO date (YYYY-MM-DD)`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${label} must be a valid calendar date`);
  }
  return date;
}

export function targetAgeFromDate(targetDate, dateOfBirth) {
  const target = parseIsoDate(targetDate, 'Target date');
  if (!dateOfBirth) {
    throw new Error('A valid date of birth is required to calculate target age');
  }
  const birth = parseIsoDate(dateOfBirth, 'Date of birth');

  let age = target.getUTCFullYear() - birth.getUTCFullYear();
  const targetMonth = target.getUTCMonth();
  const targetDay = target.getUTCDate();
  const birthMonth = birth.getUTCMonth();
  const birthDay = birth.getUTCDate();
  if (targetMonth < birthMonth || (targetMonth === birthMonth && targetDay < birthDay)) {
    age -= 1;
  }
  if (age < 0) {
    throw new Error('Target date must be on or after date of birth');
  }
  return age;
}

function optionalRupeesToPaise(value) {
  if (value === undefined || value === null || String(value).trim() === '') return 0;
  return rupeesToPaise(value);
}

export function createGoalPayload({
  title,
  targetRupees,
  currentSavedRupees,
  targetDate,
  dateOfBirth,
}) {
  const name = String(title ?? '').trim();
  if (!name) throw new Error('Goal title is required');

  return {
    name,
    goal_type: 'OTHER',
    amount_today_paise: rupeesToPaise(targetRupees),
    current_saved_paise: optionalRupeesToPaise(currentSavedRupees),
    target_age: targetAgeFromDate(targetDate, dateOfBirth),
    target_date: targetDate,
  };
}

export function mapGoalToMilestone(goal) {
  const targetPaise = Number(goal?.amount_today_paise);
  const savedPaise = Number(goal?.current_saved_paise);
  const targetAge = Number(goal?.target_age);
  const target = Number.isFinite(targetPaise) ? targetPaise / 100 : 0;
  const current = Number.isFinite(savedPaise) ? savedPaise / 100 : 0;

  return {
    id: goal?.goal_id,
    title: goal?.name || 'Untitled goal',
    target,
    current,
    deadline: goal?.target_date || (
      Number.isInteger(targetAge) ? `Target age ${targetAge}` : 'Target age unavailable'
    ),
  };
}
