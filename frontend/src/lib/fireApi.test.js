import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getFireForecast, getFireGoalImpact, getNetWorth } from './fireApi.js';
import { authenticatedRequest } from './api.js';

vi.mock('./api.js', () => ({
  authenticatedRequest: vi.fn(),
}));

describe('FIRE API wrappers (authenticated, exact routes, no client identity)', () => {
  beforeEach(() => {
    authenticatedRequest.mockClear();
    authenticatedRequest.mockResolvedValue({});
  });

  test('getFireForecast POSTs /fire/calculate with {} (stored user data, no user_id)', async () => {
    await getFireForecast();

    expect(authenticatedRequest).toHaveBeenCalledTimes(1);
    expect(authenticatedRequest).toHaveBeenCalledWith('/fire/calculate', {
      method: 'POST',
      body: {},
    });
  });

  test('getFireGoalImpact sends the exact candidate_goal body with integer paise', async () => {
    const candidateGoal = { goal_type: 'CAR', amount_today_paise: 50000000, target_age: 35 };

    await getFireGoalImpact(candidateGoal);

    expect(authenticatedRequest).toHaveBeenCalledTimes(1);
    expect(authenticatedRequest).toHaveBeenCalledWith('/fire/goal-impact', {
      method: 'POST',
      body: { candidate_goal: candidateGoal },
    });
    const sent = authenticatedRequest.mock.calls[0][1].body.candidate_goal;
    expect(Number.isInteger(sent.amount_today_paise)).toBe(true);
    expect(sent).not.toHaveProperty('user_id');
  });

  test('getNetWorth GETs /net-worth with no body', async () => {
    await getNetWorth();

    expect(authenticatedRequest).toHaveBeenCalledTimes(1);
    expect(authenticatedRequest).toHaveBeenCalledWith('/net-worth');
  });
});
