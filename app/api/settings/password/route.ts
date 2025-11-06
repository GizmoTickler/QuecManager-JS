/**
 * Password Change API
 *
 * Provides endpoint for changing user password.
 * Requires authentication and validates old password before allowing change.
 *
 * @module api/settings/password
 */

import { NextRequest } from 'next/server';
import { requireAuth, successResponse, errorResponse } from '@/lib/middleware/auth-middleware';
import { changePassword } from '@/lib/auth/password-handler';

/**
 * POST /api/settings/password
 *
 * Change user password
 *
 * Body parameters:
 * - oldPassword: Current password
 * - newPassword: New password
 *
 * Security:
 * - Requires authentication
 * - Validates old password
 * - Password format validation
 * - Rate limiting via auth middleware
 *
 * @returns {Object} JSON response with success status
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { oldPassword, newPassword } = body;

      // Validate required fields
      if (!oldPassword || !newPassword) {
        return errorResponse('Missing required fields', 400, {
          required: ['oldPassword', 'newPassword'],
        });
      }

      // Validate password length
      if (newPassword.length < 1 || newPassword.length > 128) {
        return errorResponse('Invalid password length', 400, {
          message: 'Password must be between 1 and 128 characters',
        });
      }

      // Change password (username is always 'root' in OpenWRT)
      const result = await changePassword('root', oldPassword, newPassword);

      if (!result.success) {
        return errorResponse(result.error || 'Failed to change password', 400);
      }

      return successResponse({
        message: 'Password changed successfully',
      });
    } catch (error) {
      console.error('Error changing password:', error);
      return errorResponse('Failed to change password', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
