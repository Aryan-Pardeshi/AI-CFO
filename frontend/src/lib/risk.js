export const RISK_QUESTIONS = [
  {
    key: 'horizon_need',
    question: 'When will you need most of this money?',
    options: [
      { points: 1, label: 'In less than 3 years' },
      { points: 2, label: 'In 3 to 7 years' },
      { points: 3, label: 'After 7 years' },
    ],
  },
  {
    key: 'drawdown_reaction',
    question: 'Your portfolio drops 20% in a month. You…',
    options: [
      { points: 1, label: 'Sell to stop further loss' },
      { points: 2, label: 'Hold and wait' },
      { points: 3, label: 'Buy more at lower prices' },
    ],
  },
  {
    key: 'income_stability',
    question: 'How stable is your income?',
    options: [
      { points: 1, label: 'Unstable' },
      { points: 2, label: 'Stable' },
      { points: 3, label: 'Stable, with a 6-month buffer' },
    ],
  },
  {
    key: 'experience',
    question: 'What is your investing experience?',
    options: [
      { points: 1, label: 'None' },
      { points: 2, label: 'Mutual funds' },
      { points: 3, label: 'Stocks, several years' },
    ],
  },
];

export function scoreRiskAnswers(answers) {
  if (!Array.isArray(answers) || answers.length !== 4) {
    throw new Error('Expected 4 risk answers');
  }
  for (const a of answers) {
    if (!Number.isInteger(a) || a < 1 || a > 3) {
      throw new Error('Each risk answer must be 1, 2, or 3');
    }
  }
  return answers[0] + answers[1] + answers[2] + answers[3];
}

export function suggestRiskProfile(score) {
  if (!Number.isInteger(score) || score < 4 || score > 12) {
    throw new Error('Risk score must be between 4 and 12');
  }
  if (score <= 6) return 'CONSERVATIVE';
  if (score <= 9) return 'MODERATE';
  return 'AGGRESSIVE';
}

export function explainRiskSuggestion(score) {
  const profile = suggestRiskProfile(score);
  if (profile === 'CONSERVATIVE') {
    return `Score ${score} of 12 falls in 4–6, so we suggest Conservative: shorter horizon or lower loss tolerance.`;
  }
  if (profile === 'MODERATE') {
    return `Score ${score} of 12 falls in 7–9, so we suggest Moderate: balanced horizon and loss tolerance.`;
  }
  return `Score ${score} of 12 falls in 10–12, so we suggest Aggressive: long horizon and high loss tolerance.`;
}
