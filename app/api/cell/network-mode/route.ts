/**
 * Network Mode Configuration API
 *
 * Provides endpoints for managing network mode preferences (LTE, 5G, etc.).
 * Supports GET and POST operations for network mode configuration.
 *
 * @module api/cell/network-mode
 */

import { NextRequest } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { requireAuth, successResponse, errorResponse } from '@/lib/middleware/auth-middleware';

const execFileAsync = promisify(execFile);

/**
 * Network mode types
 * - AUTO: Automatic mode selection
 * - LTE: LTE only
 * - NR5G: 5G only
 * - WCDMA: WCDMA/3G only
 * - GSM: GSM/2G only
 */
type NetworkMode =
  | 'AUTO'
  | 'LTE'
  | 'NR5G'
  | 'WCDMA'
  | 'GSM'
  | 'LTE:NR5G'
  | 'LTE:WCDMA'
  | 'LTE:WCDMA:GSM';

/**
 * 5G mode configuration
 * - 0: 5G enabled
 * - 1: 5G NSA disabled
 * - 2: 5G SA disabled
 * - 3: All 5G disabled
 */
type NR5GMode = 0 | 1 | 2 | 3;

interface NetworkModeConfig {
  preferredNetworkType: string;
  nr5gMode: string;
  nr5gDisableMode: NR5GMode;
}

/**
 * GET /api/cell/network-mode
 *
 * Fetches current network mode configuration
 *
 * @returns {Object} JSON response containing:
 *   - preferredNetworkType: Current network mode preference
 *   - nr5gMode: 5G mode configuration
 *   - nr5gDisableMode: 5G disable mode (0-3)
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const config = await fetchNetworkModeConfig();

      return successResponse(config);
    } catch (error) {
      console.error('Error fetching network mode config:', error);
      return errorResponse('Failed to fetch network mode configuration', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * POST /api/cell/network-mode
 *
 * Updates network mode configuration
 *
 * Body parameters:
 * - preferredNetworkType: Network mode (e.g., 'AUTO', 'LTE', 'NR5G')
 * - nr5gDisableMode: 5G disable mode (0-3)
 *
 * @returns {Object} JSON response with updated configuration
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { preferredNetworkType, nr5gDisableMode } = body;

      // Validate required fields
      if (!preferredNetworkType) {
        return errorResponse('Missing required field: preferredNetworkType', 400, {
          required: ['preferredNetworkType'],
        });
      }

      // Update network mode
      await updateNetworkMode(preferredNetworkType, nr5gDisableMode);

      // Fetch updated configuration
      const config = await fetchNetworkModeConfig();

      return successResponse({
        ...config,
        message: 'Network mode updated successfully',
      });
    } catch (error) {
      console.error('Error updating network mode:', error);
      return errorResponse('Failed to update network mode', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * Fetch network mode configuration from modem
 */
async function fetchNetworkModeConfig(): Promise<NetworkModeConfig> {
  try {
    // Fetch preferred network mode
    const { stdout: modeOutput } = await execFileAsync('mmcli-atcmd', [
      'AT+QNWPREFCFG="mode_pref"',
    ], { timeout: 10000 });

    // Fetch 5G disable mode
    const { stdout: nr5gOutput } = await execFileAsync('mmcli-atcmd', [
      'AT+QNWPREFCFG="nr5g_disable_mode"',
    ], { timeout: 10000 });

    // Parse responses
    const preferredNetworkType = parseNetworkMode(modeOutput);
    const nr5gDisableMode = parseNR5GMode(nr5gOutput);

    return {
      preferredNetworkType,
      nr5gMode: nr5gDisableMode === 0 ? 'Enabled' : 'Disabled',
      nr5gDisableMode,
    };
  } catch (error) {
    console.error('Error fetching network mode config:', error);
    throw new Error('Failed to fetch network mode configuration');
  }
}

/**
 * Parse network mode from AT command response
 */
function parseNetworkMode(response: string): string {
  try {
    const match = response.match(/\+QNWPREFCFG: "mode_pref","([^"]+)"/);
    return match ? match[1] : 'AUTO';
  } catch (error) {
    console.error('Error parsing network mode:', error);
    return 'AUTO';
  }
}

/**
 * Parse 5G mode from AT command response
 */
function parseNR5GMode(response: string): NR5GMode {
  try {
    const match = response.match(/\+QNWPREFCFG: "nr5g_disable_mode",(\d+)/);
    return match ? (parseInt(match[1]) as NR5GMode) : 0;
  } catch (error) {
    console.error('Error parsing NR5G mode:', error);
    return 0;
  }
}

/**
 * Update network mode configuration
 */
async function updateNetworkMode(
  preferredNetworkType: string,
  nr5gDisableMode?: NR5GMode
): Promise<void> {
  try {
    // Set preferred network mode
    await execFileAsync('mmcli-atcmd', [
      `AT+QNWPREFCFG="mode_pref",${preferredNetworkType}`,
    ], { timeout: 15000 });

    // Set 5G disable mode if provided
    if (nr5gDisableMode !== undefined) {
      await execFileAsync('mmcli-atcmd', [
        `AT+QNWPREFCFG="nr5g_disable_mode",${nr5gDisableMode}`,
      ], { timeout: 15000 });
    }

    // Note: May need to restart modem or reconnect for changes to take effect
    // This can be done by setting CFUN to 0 and back to 1
  } catch (error) {
    console.error('Error updating network mode:', error);
    throw new Error('Failed to update network mode');
  }
}
