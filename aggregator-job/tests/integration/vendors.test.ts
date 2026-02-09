import request from 'supertest';
import app from '../../src/app';

describe('Vendors Endpoint', () => {
  describe('GET /api/vendors', () => {
    it('should return 200 with status ok for valid query parameters', async () => {
      const response = await request(app)
        .get('/api/vendors')
        .query({
          storeId: 'store123',
          updatedAfter: '2024-01-01T00:00:00.000Z',
          updatedBefore: '2024-12-31T23:59:59.999Z',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });

    it('should return 400 when storeId is missing', async () => {
      const response = await request(app)
        .get('/api/vendors')
        .query({
          updatedAfter: '2024-01-01T00:00:00.000Z',
          updatedBefore: '2024-12-31T23:59:59.999Z',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'storeId',
            message: expect.stringContaining('required'),
          }),
        ])
      );
    });

    it('should return 400 when updatedAfter is missing', async () => {
      const response = await request(app)
        .get('/api/vendors')
        .query({
          storeId: 'store123',
          updatedBefore: '2024-12-31T23:59:59.999Z',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'updatedAfter',
          }),
        ])
      );
    });

    it('should return 400 when updatedBefore is missing', async () => {
      const response = await request(app)
        .get('/api/vendors')
        .query({
          storeId: 'store123',
          updatedAfter: '2024-01-01T00:00:00.000Z',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'updatedBefore',
          }),
        ])
      );
    });

    it('should return 400 for invalid date format', async () => {
      const response = await request(app)
        .get('/api/vendors')
        .query({
          storeId: 'store123',
          updatedAfter: 'invalid-date',
          updatedBefore: '2024-12-31T23:59:59.999Z',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'updatedAfter',
            message: expect.stringContaining('ISO 8601'),
          }),
        ])
      );
    });

    it('should return 400 when updatedBefore is not after updatedAfter', async () => {
      const response = await request(app)
        .get('/api/vendors')
        .query({
          storeId: 'store123',
          updatedAfter: '2024-12-31T23:59:59.999Z',
          updatedBefore: '2024-01-01T00:00:00.000Z',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'updatedBefore',
            message: 'updatedBefore must be after updatedAfter',
          }),
        ])
      );
    });

    it('should return 400 for empty storeId', async () => {
      const response = await request(app)
        .get('/api/vendors')
        .query({
          storeId: '',
          updatedAfter: '2024-01-01T00:00:00.000Z',
          updatedBefore: '2024-12-31T23:59:59.999Z',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'storeId',
          }),
        ])
      );
    });
  });
});
