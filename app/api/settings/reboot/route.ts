/**
 * System Reboot API
 *
 * Provides endpoint for rebooting the system.
 * Requires authentication and performs graceful shutdown.
 *
 * @module api/settings/reboot
 */

import { NextRequest } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { requireAuth, successResponse, errorResponse } from '@/lib/middleware/auth-middleware';

const execFileAsync = promisify(execFile);

/**
 * POST /api/settings/reboot
 *
 * Reboot the system
 *
 * Body parameters (optional):
 * - delay: Delay in seconds before reboot (default: 5)
 * - message: Reboot reason message (optional)
 *
 * Security:
 * - Requires authentication
 * - Uses 'reboot' command (no shell injection)
 * - Configurable delay for graceful shutdown
 *
 * @returns {Object} JSON response confirming reboot scheduled
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      let body = { delay: 5, message: '' };

      try {
        body = await request.json();
      } catch (error) {
        // If no body, use defaults
      }

      const { delay = 5, message = '' } = body;

      // Validate delay (must be between 0 and 300 seconds / 5 minutes)
      const delaySeconds = Math.max(0, Math.min(300, Number(delay) || 5));

      // Log reboot request
      console.log(`System reboot requested with ${delaySeconds}s delay. Reason: ${message || 'User requested'}`);

      // Schedule reboot using 'reboot' command
      // For OpenWRT/Linux, we use 'reboot' which performs graceful shutdown
      if (delaySeconds === 0) {
        // Immediate reboot
        // Don't await - let it run in background
        execFile('reboot', [], (error) => {
          if (error) {
            console.error('Reboot command failed:', error);
          }
        });
      } else {
        // Delayed reboot using 'sleep' + 'reboot'
        // Run in background to not block the response
        execFile('sh', ['-c', `sleep ${delaySeconds} && reboot`], (error) => {
          if (error) {
            console.error('Delayed reboot command failed:', error);
          }
        });
      }

      return successResponse({
        message: `System will reboot in ${delaySeconds} seconds`,
        delay: delaySeconds,
        scheduledAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error scheduling reboot:', error);
      return errorResponse('Failed to schedule reboot', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * GET /api/settings/reboot
 *
 * Check if a reboot is scheduled
 *
 * @returns {Object} JSON response with reboot status
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      // Check if shutdown command is running
      const { stdout } = await execFileAsync('ps', [], { timeout: 5000 });

      const isRebootScheduled = stdout.includes('sleep') && stdout.includes('reboot');

      return successResponse({
        scheduled: isRebootScheduled,
        message: isRebootScheduled
          ? 'Reboot is scheduled'
          : 'No reboot scheduled',
      });
    } catch (error) {
      console.error('Error checking reboot status:', error);
      return errorResponse('Failed to check reboot status', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
