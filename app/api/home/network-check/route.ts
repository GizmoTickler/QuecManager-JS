/**
 * Network Check API Route
 *
 * GET /api/home/network-check
 *
 * Checks internet connectivity by pinging 8.8.8.8
 * Returns: {"connection": "ACTIVE" | "INACTIVE"}
 *
 * Replaces: /cgi-bin/quecmanager/home/check_net.sh
 */

import { NextRequest } from 'next/server';
import { requireAuth, successResponse, errorResponse } from '@/lib/middleware/auth-middleware';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Timeout for ping operation (in ms)
const PING_TIMEOUT = 5000; // 5 seconds

/**
 * Check internet connectivity by pinging 8.8.8.8
 */
async function checkNetworkConnection(): Promise<'ACTIVE' | 'INACTIVE'> {
  try {
    await execFileAsync('ping', ['-c', '2', '-W', '3', '8.8.8.8'], {
      timeout: PING_TIMEOUT,
    });
    return 'ACTIVE';
  } catch (error) {
    return 'INACTIVE';
  }
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const connectionStatus = await checkNetworkConnection();

      return successResponse({
        connection: connectionStatus,
      });
    } catch (error) {
      console.error('Network check error:', error);
      // Even if there's an error, return INACTIVE status
      return successResponse({
        connection: 'INACTIVE',
      });
    }
  });
}
