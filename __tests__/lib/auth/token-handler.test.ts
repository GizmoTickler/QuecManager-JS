/**
 * Tests for JWT Token Handler
 */

import {
  generateToken,
  verifyToken,
  generateRandomToken,
  validateTokenFormat,
  extractTokenFromHeader,
} from '@/lib/auth/token-handler';

describe('Token Handler', () => {
  describe('generateToken', () => {
    it('should generate a valid JWT token', async () => {
      const token = await generateToken('user123', 'testuser');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });

    it('should generate unique tokens', async () => {
      const token1 = await generateToken('user1', 'testuser1');
      const token2 = await generateToken('user2', 'testuser2');

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      const token = await generateToken('user123', 'testuser');
      const payload = await verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe('user123');
      expect(payload?.username).toBe('testuser');
      expect(payload?.iat).toBeDefined();
      expect(payload?.exp).toBeDefined();
    });

    it('should return null for invalid token', async () => {
      const payload = await verifyToken('invalid.token.here');

      expect(payload).toBeNull();
    });

    it('should return null for malformed token', async () => {
      const payload = await verifyToken('not-a-jwt-token');

      expect(payload).toBeNull();
    });

    it('should validate token expiration', async () => {
      const token = await generateToken('user123', 'testuser');
      const payload = await verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.exp).toBeGreaterThan(Date.now() / 1000);
    });
  });

  describe('generateRandomToken', () => {
    it('should generate a 32-character hex token', () => {
      const token = generateRandomToken();

      expect(token).toHaveLength(32);
      expect(token).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should generate unique tokens', () => {
      const token1 = generateRandomToken();
      const token2 = generateRandomToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('validateTokenFormat', () => {
    it('should validate 32-character hex tokens', () => {
      const token = generateRandomToken();

      expect(validateTokenFormat(token)).toBe(true);
    });

    it('should validate JWT tokens', async () => {
      const token = await generateToken('user123', 'testuser');

      expect(validateTokenFormat(token)).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(validateTokenFormat('short')).toBe(false);
      expect(validateTokenFormat('not-hex-zzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false);
      expect(validateTokenFormat('')).toBe(false);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from Bearer format', () => {
      const token = 'my-token-here';
      const header = `Bearer ${token}`;

      expect(extractTokenFromHeader(header)).toBe(token);
    });

    it('should extract token from plain format', () => {
      const token = 'my-token-here';

      expect(extractTokenFromHeader(token)).toBe(token);
    });

    it('should return null for empty header', () => {
      expect(extractTokenFromHeader(null)).toBeNull();
      expect(extractTokenFromHeader('')).toBeNull();
    });

    it('should handle malformed Bearer format', () => {
      const result = extractTokenFromHeader('Bearer');

      expect(result).toBe('Bearer');
    });
  });
});
