import { ApiError, authenticatedRequest } from './api.js';

const MAX_BYTES = 1024 * 1024;

function assertCsvFile(file) {
  if (!file || typeof file.name !== 'string' || !file.name.toLowerCase().endsWith('.csv')) {
    throw new Error('Choose a .csv statement file.');
  }
  if (Number(file.size) > MAX_BYTES) {
    throw new Error('CSV files must be 1 MiB or smaller.');
  }
}

export function createStatementJob(fileName, jobId) {
  const body = { file_name: fileName, input_type: 'csv', content_type: 'text/csv' };
  if (jobId) body.job_id = jobId;
  return authenticatedRequest('/statements', { method: 'POST', body });
}

export async function uploadPresignedCsv(upload, file) {
  const response = await fetch(upload.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/csv' },
    body: file,
  });
  if (!response.ok) {
    throw new ApiError(response.status, 'UPSTREAM_UNAVAILABLE', 'The CSV upload did not complete.');
  }
}

export function processStatement(jobId) {
  return authenticatedRequest(`/statements/${encodeURIComponent(jobId)}/process`, { method: 'POST' });
}

export function getStatement(jobId) {
  return authenticatedRequest(`/statements/${encodeURIComponent(jobId)}`);
}

export function commitStatement(jobId, reviewedRows) {
  const body = reviewedRows ? { reviewed_rows: reviewedRows } : { confirm_stored_rows: true };
  return authenticatedRequest(`/statements/${encodeURIComponent(jobId)}/commit`, {
    method: 'POST',
    body,
  });
}

export async function pollStatementReview(jobId, { maxAttempts = 30, intervalMs = 500, sleep = null } = {}) {
  const wait = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const review = await getStatement(jobId);
    if (review.status === 'REVIEW_REQUIRED' || review.status === 'COMMITTED') return review;
    if (review.status === 'FAILED') throw new Error(review.error || 'Statement processing failed.');
    if (attempt < maxAttempts - 1) await wait(intervalMs);
  }
  throw new Error('Statement processing is taking longer than expected. Try again.');
}

export async function uploadAndProcessCsv(file, options = {}) {
  assertCsvFile(file);
  const created = await createStatementJob(file.name, options.jobId);
  await uploadPresignedCsv(created.upload, file);
  await processStatement(created.job_id);
  return pollStatementReview(created.job_id, options);
}
