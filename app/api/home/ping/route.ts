/**
 * Ping Data Fetching API Route
 *
 * GET /api/home/ping
 *
 * Fetches ping latency data from the background ping daemon
 * Reads from: /tmp/quecmanager/ping_latency.json
 *
 * Replaces: /cgi-bin/quecmanager/home/ping/fetch_ping.sh
 */

import { NextRequest } from 'next/server';
import { requireAuth, errorResponse, successResponse } from '@/lib/middleware/auth-middleware';
import * as fs from 'fs/promises';

// File paths
const PING_JSON_PATH = '/tmp/quecmanager/ping_latency.json';
const CONFIG_FILE_PATH = '/etc/quecmanager/settings/ping_settings.conf';

interface PingData {
  timestamp: number;
  latency: number;
  status: string;
  [key: string]: unknown;
}

/**
 * Check if ping monitoring is enabled
 */
async function isPingEnabled(): Promise<boolean> {
  try {
    const configContent = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    return configContent.includes('PING_ENABLED=true');
  } catch (error) {
    return false;
  }
}

/**
 * Read ping data from daemon file
 */
async function readPingData(): Promise<PingData | null> {
  try {
    const content = await fs.readFile(PING_JSON_PATH, 'utf-8');

    // Validate JSON format
    if (!content || !content.includes('"timestamp"')) {
      return null;
    }

    const data = JSON.parse(content);

    // Basic validation
    if (typeof data.timestamp === 'number') {
      return data as PingData;
    }

    return null;
  } catch (error) {
    console.error('Error reading ping data:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      // Try to read ping data
      const pingData = await readPingData();

      if (pingData) {
        // Successfully read ping data
        return successResponse(pingData);
      }

      // Ping data not available - check why
      const isEnabled = await isPingEnabled();

      if (isEnabled) {
        // Enabled but no data yet - daemon starting up
        return errorResponse('Ping daemon starting up', 503, {
          reason: 'Waiting for first ping result',
        });
      }

      // Check if config file exists
      try {
        await fs.access(CONFIG_FILE_PATH);
        return errorResponse('Ping monitoring disabled', 503, {
          reason: 'Enable ping monitoring in settings',
        });
      } catch {
        return errorResponse('Ping monitoring not configured', 503, {
          reason: 'Configure ping monitoring in settings',
        });
      }
    } catch (error) {
      console.error('Ping fetch error:', error);
      return errorResponse('Ping fetch failed', 500);
    }
  });
}
