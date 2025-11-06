/**
 * IMEI Configuration API
 *
 * Provides endpoints for managing IMEI profiles.
 * Supports GET, POST, and DELETE operations for IMEI configuration.
 *
 * @module api/cell/imei
 */

import { NextRequest} from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { requireAuth, successResponse, errorResponse } from '@/lib/middleware/auth-middleware';

const execFileAsync = promisify(execFile);

const IMEI_CONFIG_FILE = '/etc/quecmanager/imei_profiles.json';

/**
 * IMEI Profile structure
 */
interface IMEIProfile {
  imei: string;
  iccid: string;
}

interface IMEIProfiles {
  profile1?: IMEIProfile;
  profile2?: IMEIProfile;
}

/**
 * GET /api/cell/imei
 *
 * Fetches current IMEI profiles configuration
 *
 * @returns {Object} JSON response containing:
 *   - profile1: First IMEI profile (optional)
 *   - profile2: Second IMEI profile (optional)
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      // Read IMEI profiles from config file
      const profiles = await readIMEIProfiles();

      return successResponse(profiles);
    } catch (error) {
      console.error('Error fetching IMEI profiles:', error);
      return errorResponse('Failed to fetch IMEI profiles', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * POST /api/cell/imei
 *
 * Updates IMEI profile configuration
 *
 * Body parameters:
 * - profileId: 'profile1' | 'profile2'
 * - imei: IMEI number (15 digits)
 * - iccid: SIM card ICCID
 *
 * @returns {Object} JSON response with status
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { profileId, imei, iccid } = body;

      // Validate required fields
      if (!profileId || !imei || !iccid) {
        return errorResponse('Missing required fields', 400, {
          required: ['profileId', 'imei', 'iccid'],
        });
      }

      // Validate profileId
      if (profileId !== 'profile1' && profileId !== 'profile2') {
        return errorResponse('Invalid profileId', 400, {
          validValues: ['profile1', 'profile2'],
        });
      }

      // Validate IMEI format (15 digits)
      if (!/^\d{15}$/.test(imei)) {
        return errorResponse('Invalid IMEI format', 400, {
          format: '15 digits required',
        });
      }

      // Save IMEI profile
      await saveIMEIProfile(profileId, { imei, iccid });

      // Get current SIM ICCID
      const currentICCID = await getCurrentICCID();

      // If the profile matches current SIM, apply IMEI change
      if (currentICCID && currentICCID === iccid) {
        await applyIMEI(imei);
      }

      return successResponse({
        status: 'success',
        message: 'IMEI profile saved successfully',
        applied: currentICCID === iccid,
      });
    } catch (error) {
      console.error('Error updating IMEI profile:', error);
      return errorResponse('Failed to update IMEI profile', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * DELETE /api/cell/imei
 *
 * Deletes all IMEI profiles
 *
 * @returns {Object} JSON response confirming deletion
 */
export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      // Delete IMEI profiles file
      await deleteIMEIProfiles();

      // Reset IMEI to factory default
      await resetIMEI();

      return successResponse({
        status: 'success',
        message: 'IMEI profiles deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting IMEI profiles:', error);
      return errorResponse('Failed to delete IMEI profiles', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * Read IMEI profiles from config file
 */
async function readIMEIProfiles(): Promise<IMEIProfiles> {
  try {
    const data = await fs.readFile(IMEI_CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty profiles
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/**
 * Save IMEI profile to config file
 */
async function saveIMEIProfile(
  profileId: 'profile1' | 'profile2',
  profile: IMEIProfile
): Promise<void> {
  try {
    // Read existing profiles
    let profiles: IMEIProfiles = {};
    try {
      profiles = await readIMEIProfiles();
    } catch (error) {
      // Ignore error if file doesn't exist
    }

    // Update profile
    profiles[profileId] = profile;

    // Ensure directory exists
    await fs.mkdir('/etc/quecmanager', { recursive: true });

    // Write updated profiles
    await fs.writeFile(IMEI_CONFIG_FILE, JSON.stringify(profiles, null, 2));
  } catch (error) {
    console.error('Error saving IMEI profile:', error);
    throw new Error('Failed to save IMEI profile');
  }
}

/**
 * Delete IMEI profiles
 */
async function deleteIMEIProfiles(): Promise<void> {
  try {
    await fs.unlink(IMEI_CONFIG_FILE);
  } catch (error) {
    // Ignore error if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Get current SIM ICCID
 */
async function getCurrentICCID(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('mmcli-atcmd', ['AT+QCCID'], {
      timeout: 10000,
    });

    // Parse ICCID from response
    // Example: +QCCID: 89012345678901234567
    const match = stdout.match(/\+QCCID:\s*(\d+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error getting current ICCID:', error);
    return null;
  }
}

/**
 * Apply IMEI to modem
 */
async function applyIMEI(imei: string): Promise<void> {
  try {
    // Use AT+EGMR command to write IMEI
    // Format: AT+EGMR=1,7,"<IMEI>"
    await execFileAsync('mmcli-atcmd', [`AT+EGMR=1,7,"${imei}"`], {
      timeout: 15000,
    });

    // Note: Modem may need to be restarted for IMEI change to take effect
  } catch (error) {
    console.error('Error applying IMEI:', error);
    throw new Error('Failed to apply IMEI to modem');
  }
}

/**
 * Reset IMEI to factory default
 */
async function resetIMEI(): Promise<void> {
  try {
    // Reset IMEI using AT+EGMR
    await execFileAsync('mmcli-atcmd', ['AT+EGMR=0,7'], { timeout: 15000 });

    // Note: Modem may need to be restarted for IMEI change to take effect
  } catch (error) {
    console.error('Error resetting IMEI:', error);
    throw new Error('Failed to reset IMEI');
  }
}
