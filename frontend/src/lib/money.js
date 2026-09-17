export function rupeesToPaise(input) {
  if (input === null || input === undefined) {
    throw new Error('Amount is required');
  }
  const raw = String(input).trim();
  if (raw === '') {
    throw new Error('Amount is required');
  }
  const noCommas = raw.replace(/,/g, '');
  if (noCommas.startsWith('-')) {
    throw new Error('Amount must not be negative');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(noCommas)) {
    if (/^\d+\.\d{3,}$/.test(noCommas)) {
      throw new Error('At most 2 decimal places allowed');
    }
    throw new Error('Invalid amount');
  }
  const [rsPart, paisePart = ''] = noCommas.split('.');
  const rupees = Number.parseInt(rsPart, 10);
  const paise = paisePart === '' ? 0 : Number.parseInt(paisePart.padEnd(2, '0'), 10);
  if (!Number.isSafeInteger(rupees)) {
    throw new Error('Invalid amount');
  }
  return rupees * 100 + paise;
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
});

export function formatPaise(paise) {
  if (!Number.isInteger(paise)) {
    throw new Error('paise must be an integer');
  }
  return inrFormatter.format(paise / 100);
}
