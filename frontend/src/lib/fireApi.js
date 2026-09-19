import { authenticatedRequest } from './api.js';

/** POST /fire/calculate with {} — loads the authenticated user's stored data. */
export function getFireForecast() {
  return authenticatedRequest('/fire/calculate', { method: 'POST', body: {} });
}

/**
 * Read-only what-if: POST /fire/goal-impact with the exact candidate_goal body.
 * Never a goal write — this never touches POST /goals and persists nothing.
 */
export function getFireGoalImpact(candidateGoal) {
  return authenticatedRequest('/fire/goal-impact', {
    method: 'POST',
    body: { candidate_goal: candidateGoal },
  });
}

/** GET /net-worth — used only for emergency_fund_coverage_months (current runway). */
export function getNetWorth() {
  return authenticatedRequest('/net-worth');
}
