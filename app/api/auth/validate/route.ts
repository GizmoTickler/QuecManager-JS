/**
 * Token Validation API Route
 *
 * GET /api/auth/validate
 * Validates the user's authentication token
 *
 * Replaces: /cgi-bin/quecmanager/auth-token.sh process
 */

import { NextRequest } from 'next/server';
import { requireAuth, successResponse } from '@/lib/middleware/auth-middleware';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    return successResponse({
      state: 'success',
      user: req.user,
    });
  });
}
