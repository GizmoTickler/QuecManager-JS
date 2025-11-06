/**
 * Logout API Route
 *
 * POST /api/auth/logout
 * Invalidates the user's session
 *
 * Replaces: /cgi-bin/quecmanager/auth-token.sh removeToken
 */

import { NextRequest, NextResponse } from 'next/server';
import { successResponse } from '@/lib/middleware/auth-middleware';

export async function POST(request: NextRequest) {
  // Create response
  const response = successResponse(
    {
      state: 'success',
      message: 'Logged out successfully',
    },
    'Logout successful'
  );

  // Clear the auth cookie
  response.cookies.set('auth_token', '', {
    maxAge: 0,
    path: '/',
  });

  return response;
}

export async function GET(request: NextRequest) {
  // Support GET for backwards compatibility
  return POST(request);
}
