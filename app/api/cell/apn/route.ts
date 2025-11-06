/**
 * APN (Access Point Name) Configuration API
 *
 * Provides endpoints for managing APN profiles for cellular connectivity.
 * Supports GET, POST, and DELETE operations for APN configuration.
 *
 * @module api/cell/apn
 */

import { NextRequest } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { requireAuth, successResponse, errorResponse } from '@/lib/middleware/auth-middleware';

const execFileAsync = promisify(execFile);

/**
 * APN Profile structure
 */
interface APNProfile {
  iccid: string;
  apn: string;
  pdpType: 'IP' | 'IPV6' | 'IPV4V6';
}

interface APNProfiles {
  profile1?: APNProfile;
  profile2?: APNProfile;
}

/**
 * Service Status structure
 */
interface ServiceStatus {
  enabled: boolean;
  status: string;
}

/**
 * GET /api/cell/apn
 *
 * Fetches current APN profiles configuration
 *
 * @returns {Object} JSON response containing:
 *   - profiles: Object with profile1 and profile2 data
 *   - service: Service status information
 *   - lastActivity: Timestamp of last activity
 *   - status: Current status ('active' | 'inactive')
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      // Fetch APN profiles using AT commands
      const profiles = await fetchAPNProfiles();

      // Read service status from UCI config if available
      const serviceStatus = await getServiceStatus();

      return successResponse({
        profiles,
        service: serviceStatus,
        lastActivity: new Date().toISOString(),
        status: Object.keys(profiles).length > 0 ? 'active' : 'inactive',
      });
    } catch (error) {
      console.error('Error fetching APN profiles:', error);
      return errorResponse('Failed to fetch APN profiles', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * POST /api/cell/apn
 *
 * Updates APN profile configuration
 *
 * Body parameters:
 * - profileId: 'profile1' | 'profile2'
 * - iccid: SIM card ICCID
 * - apn: Access Point Name
 * - pdpType: 'IP' | 'IPV6' | 'IPV4V6'
 *
 * @returns {Object} JSON response with updated profiles
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { profileId, iccid, apn, pdpType } = body;

      // Validate required fields
      if (!profileId || !iccid || !apn || !pdpType) {
        return errorResponse('Missing required fields', 400, {
          required: ['profileId', 'iccid', 'apn', 'pdpType'],
        });
      }

      // Validate profileId
      if (profileId !== 'profile1' && profileId !== 'profile2') {
        return errorResponse('Invalid profileId', 400, {
          validValues: ['profile1', 'profile2'],
        });
      }

      // Validate pdpType
      if (!['IP', 'IPV6', 'IPV4V6'].includes(pdpType)) {
        return errorResponse('Invalid pdpType', 400, {
          validValues: ['IP', 'IPV6', 'IPV4V6'],
        });
      }

      // Save APN profile using AT commands
      await saveAPNProfile(profileId, { iccid, apn, pdpType });

      // Fetch updated profiles
      const profiles = await fetchAPNProfiles();
      const serviceStatus = await getServiceStatus();

      return successResponse({
        profiles,
        service: serviceStatus,
        lastActivity: new Date().toISOString(),
        status: 'success',
      });
    } catch (error) {
      console.error('Error updating APN profile:', error);
      return errorResponse('Failed to update APN profile', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * DELETE /api/cell/apn
 *
 * Deletes all APN profiles
 *
 * @returns {Object} JSON response confirming deletion
 */
export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      // Delete all APN profiles using AT commands
      await deleteAPNProfiles();

      return successResponse({
        profiles: {},
        service: { enabled: false, status: 'disabled' },
        lastActivity: new Date().toISOString(),
        status: 'success',
      });
    } catch (error) {
      console.error('Error deleting APN profiles:', error);
      return errorResponse('Failed to delete APN profiles', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * Fetch APN profiles from modem using AT commands
 */
async function fetchAPNProfiles(): Promise<APNProfiles> {
  try {
    // Fetch CGDCONT (PDP context configuration)
    const { stdout: cgdcontOutput } = await execFileAsync('mmcli-atcmd', [
      'AT+CGDCONT?',
    ], { timeout: 10000 });

    // Fetch QMAP (Profile mapping)
    const { stdout: qmapOutput } = await execFileAsync('mmcli-atcmd', [
      'AT+QMAP="WWAN"',
    ], { timeout: 10000 });

    // Fetch CGCONTRDP (Active PDP context info)
    const { stdout: cgcontrdpOutput } = await execFileAsync('mmcli-atcmd', [
      'AT+CGCONTRDP',
    ], { timeout: 10000 });

    // Parse the profiles
    const profiles = parseAPNProfiles(cgdcontOutput, qmapOutput, cgcontrdpOutput);

    return profiles;
  } catch (error) {
    console.error('Error fetching APN profiles:', error);
    return {};
  }
}

/**
 * Parse APN profiles from AT command responses
 */
function parseAPNProfiles(
  cgdcontOutput: string,
  qmapOutput: string,
  cgcontrdpOutput: string
): APNProfiles {
  const profiles: APNProfiles = {};

  try {
    // Extract active profile ID from QMAP
    const qmapMatch = qmapOutput.match(/\+QMAP: "WWAN",\d+,(\d+),/);
    const activeProfileId = qmapMatch ? qmapMatch[1] : null;

    // Parse CGDCONT lines
    const cgdcontLines = cgdcontOutput
      .split('\n')
      .filter((line) => line.includes('+CGDCONT:'));

    cgdcontLines.forEach((line, index) => {
      const parts = line.split(',');
      if (parts.length < 3) return;

      // Extract CID
      const cid = parts[0].replace('+CGDCONT:', '').trim();

      // Extract PDP type
      const pdpType = parts[1].replace(/"/g, '').trim() as 'IP' | 'IPV6' | 'IPV4V6';

      // Extract APN
      let apn = parts[2].replace(/"/g, '').trim();

      // If APN is empty and this is the active profile, get from CGCONTRDP
      if ((!apn || apn === '') && cid === activeProfileId) {
        const cgcontrdpLine = cgcontrdpOutput.split('\n').find((line) => {
          const match = line.match(/\+CGCONTRDP: (\d+),/);
          return match && match[1] === cid;
        });

        if (cgcontrdpLine) {
          const rdpParts = cgcontrdpLine.split(',');
          if (rdpParts.length >= 3) {
            apn = rdpParts[2].replace(/"/g, '').trim();
          }
        }
      }

      // Store in profile1 or profile2 based on index
      const profileKey = index === 0 ? 'profile1' : 'profile2';
      if (apn && pdpType) {
        profiles[profileKey] = {
          iccid: '', // ICCID needs to be fetched separately or stored elsewhere
          apn,
          pdpType,
        };
      }
    });

    return profiles;
  } catch (error) {
    console.error('Error parsing APN profiles:', error);
    return {};
  }
}

/**
 * Save APN profile using AT commands
 */
async function saveAPNProfile(
  profileId: 'profile1' | 'profile2',
  profile: APNProfile
): Promise<void> {
  try {
    // Determine CID based on profileId (1 for profile1, 2 for profile2)
    const cid = profileId === 'profile1' ? 1 : 2;

    // Set PDP context using AT+CGDCONT
    const atCommand = `AT+CGDCONT=${cid},"${profile.pdpType}","${profile.apn}"`;

    await execFileAsync('mmcli-atcmd', [atCommand], { timeout: 15000 });

    // Activate the profile if it's profile1
    if (profileId === 'profile1') {
      // Activate WWAN interface
      await execFileAsync('mmcli-atcmd', [
        `AT+QMAP="WWAN",1,${cid},1`,
      ], { timeout: 15000 });
    }
  } catch (error) {
    console.error('Error saving APN profile:', error);
    throw new Error('Failed to save APN profile');
  }
}

/**
 * Delete all APN profiles
 */
async function deleteAPNProfiles(): Promise<void> {
  try {
    // Deactivate WWAN interface
    await execFileAsync('mmcli-atcmd', ['AT+QMAP="WWAN",0'], {
      timeout: 10000,
    });

    // Delete PDP contexts
    await execFileAsync('mmcli-atcmd', ['AT+CGDCONT=1'], { timeout: 10000 });
    await execFileAsync('mmcli-atcmd', ['AT+CGDCONT=2'], { timeout: 10000 });
  } catch (error) {
    console.error('Error deleting APN profiles:', error);
    throw new Error('Failed to delete APN profiles');
  }
}

/**
 * Get service status from UCI config
 */
async function getServiceStatus(): Promise<ServiceStatus> {
  try {
    const { stdout } = await execFileAsync('uci', [
      '-q',
      'get',
      'quecmanager.apn.enabled',
    ], { timeout: 5000 });

    const enabled = ['true', '1', 'on', 'yes', 'enabled'].includes(
      stdout.trim().toLowerCase()
    );

    return {
      enabled,
      status: enabled ? 'active' : 'inactive',
    };
  } catch (error) {
    // If UCI config doesn't exist, return default
    return {
      enabled: false,
      status: 'inactive',
    };
  }
}
