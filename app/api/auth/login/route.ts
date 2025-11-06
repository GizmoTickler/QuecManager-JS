/**
 * Login API Route
 *
 * POST /api/auth/login
 * Authenticates user and returns JWT token
 *
 * Replaces: /cgi-bin/quecmanager/auth.sh
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, checkRateLimit } from '@/lib/auth/password-handler';
import { generateToken, COOKIE_OPTIONS } from '@/lib/auth/token-handler';
import { getClientIP, errorResponse, successResponse } from '@/lib/middleware/auth-middleware';

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const clientIP = getClientIP(request);

    // Check rate limit
    const rateLimit = checkRateLimit(clientIP);
    if (!rateLimit.allowed) {
      const resetInSeconds = rateLimit.resetTime
        ? Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
        : 60;

      return errorResponse(
        `Too many login attempts. Please try again in ${resetInSeconds} seconds.`,
        429,
        { resetInSeconds }
      );
    }

    // Parse request body
    const contentType = request.headers.get('content-type');
    let password: string;

    if (contentType?.includes('application/json')) {
      const body = await request.json();
      password = body.password;
    } else if (contentType?.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      password = formData.get('password') as string;
    } else {
      return errorResponse('Invalid content type', 400);
    }

    // Validate password exists
    if (!password) {
      return errorResponse('Password is required', 400);
    }

    // Verify password
    const username = 'root'; // Default username for the system
    const isValid = await verifyPassword(username, password);

    if (!isValid) {
      return errorResponse('Invalid credentials', 401);
    }

    // Generate JWT token
    const token = await generateToken(username, username);

    // Create response with token in cookie
    const response = successResponse(
      {
        state: 'success',
        token,
        username,
      },
      'Login successful'
    );

    // Set httpOnly cookie
    response.cookies.set('auth_token', token, COOKIE_OPTIONS);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('Login failed', 500);
  }
}
