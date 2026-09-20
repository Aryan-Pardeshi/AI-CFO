export const RISK_QUESTIONS = [
  {
    key: 'horizon_need',
    question: 'When might you need to use most of this investment money?',
    options: [
      { points: 1, label: 'Within 3 years' },
      { points: 2, label: 'In 3 to 7 years' },
      { points: 3, label: 'More than 7 years' },
    ],
  },
  {
    key: 'drawdown_reaction',
    question: 'If your investments fell 20% in one month, what would you most likely do?',
    options: [
      { points: 1, label: 'Sell to avoid further losses' },
      { points: 2, label: 'Stay invested and wait' },
      { points: 3, label: 'Invest more while prices are lower' },
    ],
  },
  {
    key: 'income_stability',
    question: 'How secure is your income and emergency fund today?',
    options: [
      { points: 1, label: 'Income changes often or I have no buffer' },
      { points: 2, label: 'Stable income, with a limited buffer' },
      { points: 3, label: 'Stable income and a 6+ month buffer' },
    ],
  },
  {
    key: 'experience',
    question: 'How familiar are you with investing?',
    options: [
      { points: 1, label: 'New to investing' },
      { points: 2, label: 'Some experience with mutual funds or stocks' },
      { points: 3, label: 'Comfortable managing investments myself' },
    ],
  },
];

export const RISK_WILLINGNESS_QUESTION = {
  question: 'How much investment risk are you comfortable taking?',
  helper: 'This is about the market ups and downs you can genuinely live with, not your investing experience.',
  options: [
    { profile: 'CONSERVATIVE', label: 'Low — protecting my money matters most' },
    { profile: 'MODERATE', label: 'Medium — I can accept some ups and downs' },
    { profile: 'AGGRESSIVE', label: 'High — I can accept sharp ups and downs for higher return potential' },
  ],
};

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
