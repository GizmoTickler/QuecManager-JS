/**
 * Device Info API Route
 *
 * GET /api/device/info
 *
 * Returns device/system information including uptime
 * Reads from: /proc/uptime
 *
 * Replaces: /cgi-bin/quecmanager/settings/device-uptime.sh
 */

import { NextRequest } from 'next/server';
import { requireAuth, successResponse, errorResponse } from '@/lib/middleware/auth-middleware';
import * as fs from 'fs/promises';

interface UptimeInfo {
  total_seconds: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
}

/**
 * Read system uptime from /proc/uptime
 */
async function getSystemUptime(): Promise<UptimeInfo> {
  try {
    const content = await fs.readFile('/proc/uptime', 'utf-8');
    const uptimeStr = content.split(' ')[0]; // First value is system uptime
    const uptime = Math.floor(parseFloat(uptimeStr));

    // Calculate days, hours, minutes, seconds
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    // Format uptime string
    let formattedParts: string[] = [];
    if (days > 0) formattedParts.push(`${days}d`);
    if (hours > 0) formattedParts.push(`${hours}h`);
    if (minutes > 0) formattedParts.push(`${minutes}m`);
    formattedParts.push(`${seconds}s`);

    return {
      total_seconds: uptime,
      days,
      hours,
      minutes,
      seconds,
      formatted: formattedParts.join(' '),
    };
  } catch (error) {
    console.error('Error reading uptime:', error);
    // Return zero uptime on error
    return {
      total_seconds: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      formatted: '0s',
    };
  }
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const uptime = await getSystemUptime();

      return successResponse({
        timestamp: new Date().toISOString(),
        uptime,
      });
    } catch (error) {
      console.error('Device info fetch error:', error);
      return errorResponse('Device info fetch failed', 500);
    }
  });
}
