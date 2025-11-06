/**
 * Band Locking Configuration API
 *
 * Provides endpoints for managing band locking configuration for LTE, NSA, and SA modes.
 * Supports GET and POST operations for band lock configuration.
 *
 * @module api/cell/band-lock
 */

import { NextRequest } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { requireAuth, successResponse, errorResponse } from '@/lib/middleware/auth-middleware';

const execFileAsync = promisify(execFile);

interface BandLockConfig {
  lte: {
    supported: number[];
    locked: number[];
  };
  nsa: {
    supported: number[];
    locked: number[];
  };
  sa: {
    supported: number[];
    locked: number[];
  };
}

/**
 * GET /api/cell/band-lock
 *
 * Fetches current band locking configuration
 *
 * @returns {Object} JSON response containing:
 *   - lte: LTE band configuration (supported and locked bands)
 *   - nsa: NSA 5G band configuration
 *   - sa: SA 5G band configuration
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const config = await fetchBandLockConfig();

      return successResponse(config);
    } catch (error) {
      console.error('Error fetching band lock config:', error);
      return errorResponse('Failed to fetch band lock configuration', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * POST /api/cell/band-lock
 *
 * Updates band locking configuration
 *
 * Body parameters:
 * - bandType: 'lte' | 'nsa' | 'sa'
 * - bands: Array of band numbers to lock (e.g., [2, 4, 12, 66])
 *
 * @returns {Object} JSON response with updated configuration
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { bandType, bands } = body;

      // Validate required fields
      if (!bandType || !Array.isArray(bands)) {
        return errorResponse('Missing required fields', 400, {
          required: ['bandType', 'bands'],
        });
      }

      // Validate bandType
      if (!['lte', 'nsa', 'sa'].includes(bandType)) {
        return errorResponse('Invalid bandType', 400, {
          validValues: ['lte', 'nsa', 'sa'],
        });
      }

      // Update band lock configuration
      await updateBandLock(bandType, bands);

      // Fetch updated configuration
      const config = await fetchBandLockConfig();

      return successResponse({
        ...config,
        message: `${bandType.toUpperCase()} band lock updated successfully`,
      });
    } catch (error) {
      console.error('Error updating band lock:', error);
      return errorResponse('Failed to update band lock', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * Fetch band lock configuration from modem
 */
async function fetchBandLockConfig(): Promise<BandLockConfig> {
  try {
    // Fetch LTE bands (supported and locked)
    const { stdout: lteSupportedOutput } = await execFileAsync('mmcli-atcmd', [
      'AT+QNWPREFCFG="lte_band"',
    ], { timeout: 10000 });

    // Fetch NSA 5G bands
    const { stdout: nsaSupportedOutput } = await execFileAsync('mmcli-atcmd', [
      'AT+QNWPREFCFG="nsa_nr5g_band"',
    ], { timeout: 10000 });

    // Fetch SA 5G bands (for supported bands, use nrdc_nr5g_band)
    const { stdout: saSupportedOutput } = await execFileAsync('mmcli-atcmd', [
      'AT+QNWPREFCFG="nrdc_nr5g_band"',
    ], { timeout: 10000 });

    // Fetch active SA 5G bands (for locked bands, use nr5g_band)
    const { stdout: saActiveOutput } = await execFileAsync('mmcli-atcmd', [
      'AT+QNWPREFCFG="nr5g_band"',
    ], { timeout: 10000 });

    // Parse band configurations
    const lte = parseBandConfig(lteSupportedOutput, lteSupportedOutput);
    const nsa = parseBandConfig(nsaSupportedOutput, nsaSupportedOutput);
    const sa = parseBandConfig(saSupportedOutput, saActiveOutput);

    return { lte, nsa, sa };
  } catch (error) {
    console.error('Error fetching band lock config:', error);
    throw new Error('Failed to fetch band lock configuration');
  }
}

/**
 * Parse band configuration from AT command responses
 */
function parseBandConfig(
  supportedOutput: string,
  activeOutput: string
): { supported: number[]; locked: number[] } {
  try {
    // Parse supported bands
    const supportedMatch = supportedOutput.match(/\+QNWPREFCFG: "[^"]+",([0-9:]+)/);
    const supported = supportedMatch
      ? supportedMatch[1].split(':').map((b) => parseInt(b, 16))
      : [];

    // Parse locked/active bands
    const activeMatch = activeOutput.match(/\+QNWPREFCFG: "[^"]+",([0-9:]+)/);
    const locked = activeMatch
      ? activeMatch[1].split(':').map((b) => parseInt(b, 16))
      : [];

    return { supported, locked };
  } catch (error) {
    console.error('Error parsing band config:', error);
    return { supported: [], locked: [] };
  }
}

/**
 * Update band lock configuration
 */
async function updateBandLock(
  bandType: 'lte' | 'nsa' | 'sa',
  bands: number[]
): Promise<void> {
  try {
    // Convert band numbers to hex format and join with colons
    const bandsHex = bands.map((b) => b.toString(16)).join(':');

    // Determine AT command parameter based on band type
    let atParam: string;
    switch (bandType) {
      case 'lte':
        atParam = 'lte_band';
        break;
      case 'nsa':
        atParam = 'nsa_nr5g_band';
        break;
      case 'sa':
        atParam = 'nr5g_band';
        break;
    }

    // Set band lock using AT command
    await execFileAsync('mmcli-atcmd', [
      `AT+QNWPREFCFG="${atParam}",${bandsHex}`,
    ], { timeout: 15000 });

    // Note: Band lock changes may require modem restart to take effect
  } catch (error) {
    console.error('Error updating band lock:', error);
    throw new Error('Failed to update band lock');
  }
}
