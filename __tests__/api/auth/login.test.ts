/**
 * Integration tests for Login API Route
 *
 * Note: These tests mock the password verification and rate limiting
 * to avoid system dependencies.
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/login/route';

// Mock the password handler
jest.mock('@/lib/auth/password-handler', () => ({
  verifyPassword: jest.fn(),
  checkRateLimit: jest.fn(),
}));

// Mock the token handler
jest.mock('@/lib/auth/token-handler', () => ({
  generateToken: jest.fn(),
  COOKIE_OPTIONS: {
    httpOnly: true,
    secure: false,
    sameSite: 'strict' as const,
    maxAge: 7200,
    path: '/',
  },
}));

import { verifyPassword, checkRateLimit } from '@/lib/auth/password-handler';
import { generateToken } from '@/lib/auth/token-handler';

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    (checkRateLimit as jest.Mock).mockReturnValue({
      allowed: true,
      remainingAttempts: 4,
    });

    (verifyPassword as jest.Mock).mockResolvedValue(true);
    (generateToken as jest.Mock).mockResolvedValue('test-jwt-token-12345');
  });

  describe('successful login', () => {
    it('should return token on valid credentials', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: 'correct-password' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.data.token).toBe('test-jwt-token-12345');
      expect(data.data.username).toBe('root');
    });

    it('should set httpOnly cookie', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: 'correct-password' }),
      });

      const response = await POST(request);

      // Check that cookie is set (Next.js response.cookies)
      expect(response.cookies.get('auth_token')).toBeDefined();
    });
  });

  describe('failed login', () => {
    it('should return 401 on invalid credentials', async () => {
      (verifyPassword as jest.Mock).mockResolvedValue(false);

      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: 'wrong-password' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.status).toBe('error');
      expect(data.error).toContain('Invalid credentials');
    });

    it('should return 400 if password is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('required');
    });
  });

  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (checkRateLimit as jest.Mock).mockReturnValue({
        allowed: false,
        resetTime: Date.now() + 60000,
      });

      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: 'test' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toContain('Too many login attempts');
    });
  });

  describe('content type support', () => {
    it('should support application/x-www-form-urlencoded', async () => {
      const formData = new FormData();
      formData.append('password', 'test-password');

      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });
});
