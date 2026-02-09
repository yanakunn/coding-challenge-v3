import request from 'supertest';
import app from '../../src/app';

describe('Health Check Endpoint', () => {
  describe('GET /api/health', () => {
    it('should return 200 with ok status and connected database', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('database', 'connected');
      expect(new Date(response.body.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('should include valid ISO timestamp', async () => {
      const response = await request(app).get('/api/health');

      const timestamp = response.body.timestamp;
      expect(timestamp).toBeDefined();
      expect(() => new Date(timestamp).toISOString()).not.toThrow();
    });
  });
});
