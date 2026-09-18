import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  commitStatement,
  createStatementJob,
  getStatement,
  processStatement,
  uploadAndProcessCsv,
} from './statementsApi.js';
import { authenticatedRequest } from './api.js';

vi.mock('./api.js', () => ({
  authenticatedRequest: vi.fn(),
}));

describe('statement API orchestration', () => {
  beforeEach(() => {
    authenticatedRequest.mockReset();
    global.fetch = vi.fn();
  });

  test('maps bounded CSV job payload and uploads the real file to presigned S3', async () => {
    const file = { name: 'bank.csv', type: 'text/csv', size: 20 };
    authenticatedRequest
      .mockResolvedValueOnce({ job_id: 'job-1', upload: { url: 'https://s3.test/upload' } })
      .mockResolvedValueOnce({ status: 'REVIEW_REQUIRED' })
      .mockResolvedValueOnce({ status: 'REVIEW_REQUIRED', review_rows: [] });
    global.fetch.mockResolvedValueOnce({ ok: true, text: async () => '' });

    const result = await uploadAndProcessCsv(file);

    expect(authenticatedRequest).toHaveBeenNthCalledWith(1, '/statements', {
      method: 'POST',
      body: { file_name: 'bank.csv', input_type: 'csv', content_type: 'text/csv' },
    });
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://s3.test/upload', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/csv' },
      body: file,
    });
    expect(authenticatedRequest).toHaveBeenNthCalledWith(2, '/statements/job-1/process', {
      method: 'POST',
    });
    expect(authenticatedRequest).toHaveBeenNthCalledWith(3, '/statements/job-1');
    expect(result.review_rows).toEqual([]);
  });

  test('commit sends explicit reviewed rows or stored-row confirmation without client identity', async () => {
    authenticatedRequest.mockResolvedValue({ status: 'COMMITTED' });
    const rows = [{ txn_id: 'row-1', amount_paise: 100, direction: 'CREDIT' }];

    await commitStatement('job-1', rows);
    await commitStatement('job-1');

    expect(authenticatedRequest).toHaveBeenNthCalledWith(1, '/statements/job-1/commit', {
      method: 'POST',
      body: { reviewed_rows: rows },
    });
    expect(authenticatedRequest).toHaveBeenNthCalledWith(2, '/statements/job-1/commit', {
      method: 'POST',
      body: { confirm_stored_rows: true },
    });
  });

  test('small API helpers preserve statement paths', async () => {
    authenticatedRequest.mockResolvedValue({ ok: true });

    await createStatementJob('bank.csv');
    await processStatement('job-1');
    await getStatement('job-1');

    expect(authenticatedRequest).toHaveBeenNthCalledWith(1, '/statements', expect.any(Object));
    expect(authenticatedRequest).toHaveBeenNthCalledWith(2, '/statements/job-1/process', { method: 'POST' });
    expect(authenticatedRequest).toHaveBeenNthCalledWith(3, '/statements/job-1');
  });
});
