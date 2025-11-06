/**
 * Memory Data Fetching API Route
 *
 * GET /api/home/memory
 *
 * Fetches memory usage data from the background memory daemon
 * Reads from: /tmp/quecmanager/memory.json
 *
 * Replaces: /cgi-bin/quecmanager/home/memory/fetch_memory.sh
 */

import { NextRequest } from 'next/server';
import { requireAuth, errorResponse, successResponse } from '@/lib/middleware/auth-middleware';
import * as fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// File paths
const MEMORY_JSON_PATH = '/tmp/quecmanager/memory.json';
const UCI_CONFIG = 'quecmanager';
const UCI_SECTION = 'memory_daemon';

interface MemoryData {
  total: number;
  used: number;
  available: number;
  free?: number;
  cached?: number;
  timestamp?: number;
  [key: string]: unknown;
}

/**
 * Check if memory monitoring is enabled via UCI
 */
async function isMemoryEnabled(): Promise<boolean> {
  try {
    // Check if UCI section exists
    const { stdout: sectionCheck } = await execFileAsync('uci', [
      '-q',
      'get',
      `${UCI_CONFIG}.${UCI_SECTION}`,
    ]);

    if (!sectionCheck) {
      return false;
    }

    // Get enabled value
    const { stdout: enabledValue } = await execFileAsync('uci', [
      '-q',
      'get',
      `${UCI_CONFIG}.${UCI_SECTION}.enabled`,
    ]);

    const value = enabledValue.trim().toLowerCase();
    return ['true', '1', 'on', 'yes', 'enabled'].includes(value);
  } catch (error) {
    return false;
  }
}

/**
 * Read memory data from daemon file
 */
async function readMemoryData(): Promise<MemoryData | null> {
  try {
    const content = await fs.readFile(MEMORY_JSON_PATH, 'utf-8');

    // Validate JSON format - must have required fields
    if (!content || !content.includes('"total"')) {
      return null;
    }

    const data = JSON.parse(content);

    // Validate required fields
    if (
      typeof data.total === 'number' &&
      typeof data.used === 'number' &&
      typeof data.available === 'number'
    ) {
      return data as MemoryData;
    }

    return null;
  } catch (error) {
    console.error('Error reading memory data:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      // Try to read memory data
      const memoryData = await readMemoryData();

      if (memoryData) {
        // Successfully read memory data
        return successResponse(memoryData);
      }

      // Memory data not available - check why
      const isEnabled = await isMemoryEnabled();

      if (isEnabled) {
        // Enabled but no data yet - daemon starting up
        return errorResponse('Memory daemon starting up', 503, {
          reason: 'Waiting for first memory reading',
        });
      }

      // Check if UCI config exists
      try {
        await execFileAsync('uci', ['-q', 'get', `${UCI_CONFIG}.${UCI_SECTION}`]);
        return errorResponse('Memory monitoring disabled', 503, {
          reason: 'Enable memory monitoring in settings',
        });
      } catch {
        return errorResponse('Memory monitoring not configured', 503, {
          reason: 'Configure memory monitoring in settings',
        });
      }
    } catch (error) {
      console.error('Memory fetch error:', error);
      return errorResponse('Memory fetch failed', 500);
    }
  });
}
