/**
 * Public IP Fetching API Route
 *
 * GET /api/home/public-ip
 *
 * Fetches the public IPv4 address by:
 * 1. Checking internet connectivity via ping
 * 2. Fetching public IP from api.ipify.org
 *
 * Replaces: /cgi-bin/quecmanager/home/fetch_public_ip.sh
 */

import { NextRequest } from 'next/server';
import { requireAuth, errorResponse, successResponse } from '@/lib/middleware/auth-middleware';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Timeout for network operations (in ms)
const PING_TIMEOUT = 5000; // 5 seconds
const FETCH_TIMEOUT = 10000; // 10 seconds

/**
 * Check internet connectivity by pinging 8.8.8.8
 */
async function checkInternetConnectivity(): Promise<boolean> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'ping',
      ['-c', '2', '-W', '3', '8.8.8.8'],
      {
        timeout: PING_TIMEOUT,
      }
    );
    return true;
  } catch (error) {
    console.error('Internet connectivity check failed:', error);
    return false;
  }
}

/**
 * Fetch public IP from api.ipify.org
 */
async function fetchPublicIP(): Promise<string | null> {
  const methods = [
    { cmd: 'curl', args: ['-s', '-m', '5', 'https://api.ipify.org'] },
    { cmd: 'wget', args: ['-qO-', '--timeout=5', 'https://api.ipify.org'] },
    { cmd: 'uclient-fetch', args: ['-qO-', '--timeout=5', 'https://api.ipify.org'] },
  ];

  // Try each method in order
  for (const method of methods) {
    try {
      const { stdout } = await execFileAsync(method.cmd, method.args, {
        timeout: FETCH_TIMEOUT,
        maxBuffer: 1024, // Public IPs are short
      });

      const ip = stdout.trim();

      // Validate IP format (basic check)
      if (ip && /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
        return ip;
      }
    } catch (error) {
      // Try next method
      console.warn(`${method.cmd} failed, trying next method...`);
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      // Check internet connectivity first
      const isConnected = await checkInternetConnectivity();

      if (!isConnected) {
        return errorResponse('No internet connectivity', 503, {
          reason: 'Failed to ping 8.8.8.8',
        });
      }

      // Fetch public IP
      const publicIP = await fetchPublicIP();

      if (!publicIP) {
        return errorResponse('Failed to fetch public IP', 503, {
          reason: 'All fetch methods failed',
        });
      }

      // Return success response
      return successResponse({
        public_ip: publicIP,
      });
    } catch (error) {
      console.error('Public IP fetch error:', error);
      return errorResponse('Public IP fetch failed', 500);
    }
  });
}
