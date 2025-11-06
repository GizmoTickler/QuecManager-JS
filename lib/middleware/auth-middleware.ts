/**
 * Authentication Middleware
 *
 * Middleware for Next.js API routes to validate authentication tokens.
 * Replaces the shell-based token validation with JWT verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractTokenFromHeader } from '../auth/token-handler';

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    userId: string;
    username: string;
  };
}

/**
 * Middleware to require authentication
 */
export async function requireAuth(
  request: NextRequest,
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  // Extract token from Authorization header or cookie
  let token: string | null = null;

  // Try Authorization header first
  const authHeader = request.headers.get('authorization');
  token = extractTokenFromHeader(authHeader);

  // Fallback to cookie
  if (!token) {
    token = request.cookies.get('auth_token')?.value || null;
  }

  // Check if token exists
  if (!token) {
    return NextResponse.json(
      {
        error: 'Authentication required',
        status: 'error',
      },
      { status: 401 }
    );
  }

  // Verify token
  const payload = await verifyToken(token);

  if (!payload) {
    return NextResponse.json(
      {
        error: 'Invalid or expired token',
        status: 'error',
      },
      { status: 401 }
    );
  }

  // Add user info to request
  const authenticatedRequest = request as AuthenticatedRequest;
  authenticatedRequest.user = {
    userId: payload.userId,
    username: payload.username,
  };

  // Call the handler
  return handler(authenticatedRequest);
}

/**
 * Extract client IP address from request
 */
export function getClientIP(request: NextRequest): string {
  // Try various headers that might contain the real IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map((ip) => ip.trim());
    return ips[0];
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to unknown (connection IP not available in NextRequest)
  return 'unknown';
}

/**
 * Error response helper
 */
export function errorResponse(
  message: string,
  status: number = 400,
  details?: unknown
): NextResponse {
  const responseBody: {
    error: string;
    status: string;
    details?: unknown;
  } = {
    error: message,
    status: 'error',
  };

  if (details) {
    responseBody.details = details;
  }

  return NextResponse.json(responseBody, { status });
}

/**
 * Success response helper
 */
export function successResponse<T>(
  data: T,
  message?: string
): NextResponse {
  const responseBody: {
    data: T;
    status: string;
    message?: string;
  } = {
    data,
    status: 'success',
  };

  if (message) {
    responseBody.message = message;
  }

  return NextResponse.json(responseBody);
}
