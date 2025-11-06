/**
 * Token Handler
 *
 * JWT-based authentication token management.
 * Replaces the file-based token system from auth-token.sh with secure JWT tokens.
 *
 * Features:
 * - JWT tokens with expiration
 * - Secure random token generation
 * - Token validation
 * - httpOnly cookie support
 */

import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'crypto';

// Configuration
const TOKEN_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
const TOKEN_EXPIRATION = '2h'; // 2 hours
const TOKEN_ALGORITHM = 'HS256';

export interface TokenPayload {
  userId: string;
  username: string;
  iat: number;
  exp: number;
}

/**
 * Generate a secure JWT token
 */
export async function generateToken(userId: string, username: string): Promise<string> {
  const secret = new TextEncoder().encode(TOKEN_SECRET);

  const token = await new SignJWT({ userId, username })
    .setProtectedHeader({ alg: TOKEN_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRATION)
    .sign(secret);

  return token;
}

/**
 * Verify and decode JWT token
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const secret = new TextEncoder().encode(TOKEN_SECRET);

    const { payload } = await jwtVerify(token, secret, {
      algorithms: [TOKEN_ALGORITHM],
    });

    // Validate payload structure
    if (
      typeof payload.userId === 'string' &&
      typeof payload.username === 'string' &&
      typeof payload.iat === 'number' &&
      typeof payload.exp === 'number'
    ) {
      return payload as unknown as TokenPayload;
    }

    return null;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Generate a random token (32 hex characters for compatibility)
 */
export function generateRandomToken(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Validate token format (for backwards compatibility with shell scripts)
 */
export function validateTokenFormat(token: string): boolean {
  // JWT tokens or 32 hex character tokens
  if (token.length === 32 && /^[0-9a-fA-F]{32}$/.test(token)) {
    return true;
  }

  // JWT tokens have 3 parts separated by dots
  if (token.split('.').length === 3) {
    return true;
  }

  return false;
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;

  // Support both "Bearer TOKEN" and just "TOKEN"
  const parts = authHeader.split(' ');

  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return null;
}

/**
 * Cookie options for httpOnly cookies
 */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 2 * 60 * 60, // 2 hours in seconds
  path: '/',
};
