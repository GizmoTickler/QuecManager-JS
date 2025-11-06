/**
 * Cell Locking Configuration API
 *
 * Provides endpoints for managing cell locking configuration.
 * Supports locking to specific LTE and NR5G cells by EARFCN/PCI.
 *
 * @module api/cell/lock
 */

import { NextRequest } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { requireAuth, successResponse, errorResponse } from '@/lib/middleware/auth-middleware';

const execFileAsync = promisify(execFile);

/**
 * LTE Cell Lock Configuration
 */
interface LTECellLock {
  EARFCN1: string;
  PCI1: string;
  EARFCN2: string;
  PCI2: string;
  EARFCN3: string;
  PCI3: string;
}

/**
 * NR5G Cell Lock Configuration
 */
interface NR5GCellLock {
  NRARFCN: string;
  NRPCI: string;
  SCS: string;
  NRBAND: string;
}

interface CellLockConfig {
  lteLocked: boolean;
  nr5gLocked: boolean;
  ltePersist: boolean;
  nr5gPersist: boolean;
  lteParams: LTECellLock;
  nr5gParams: NR5GCellLock;
}

/**
 * GET /api/cell/lock
 *
 * Fetches current cell locking configuration
 *
 * @returns {Object} JSON response containing:
 *   - lteLocked: Whether LTE cell is locked
 *   - nr5gLocked: Whether NR5G cell is locked
 *   - ltePersist: LTE lock persist flag
 *   - nr5gPersist: NR5G lock persist flag
 *   - lteParams: LTE cell lock parameters
 *   - nr5gParams: NR5G cell lock parameters
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const config = await fetchCellLockConfig();

      return successResponse(config);
    } catch (error) {
      console.error('Error fetching cell lock config:', error);
      return errorResponse('Failed to fetch cell lock configuration', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * POST /api/cell/lock
 *
 * Updates cell locking configuration
 *
 * Body parameters:
 * - cellType: 'lte' | 'nr5g'
 * - action: 'lock' | 'unlock'
 * - persist: boolean (optional, for lock action)
 * - params: Cell lock parameters (for lock action)
 *   - For LTE: { EARFCN1, PCI1, EARFCN2, PCI2, EARFCN3, PCI3 }
 *   - For NR5G: { NRARFCN, NRPCI, SCS, NRBAND }
 *
 * @returns {Object} JSON response with updated configuration
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { cellType, action, persist, params } = body;

      // Validate required fields
      if (!cellType || !action) {
        return errorResponse('Missing required fields', 400, {
          required: ['cellType', 'action'],
        });
      }

      // Validate cellType
      if (!['lte', 'nr5g'].includes(cellType)) {
        return errorResponse('Invalid cellType', 400, {
          validValues: ['lte', 'nr5g'],
        });
      }

      // Validate action
      if (!['lock', 'unlock'].includes(action)) {
        return errorResponse('Invalid action', 400, {
          validValues: ['lock', 'unlock'],
        });
      }

      // Execute cell lock/unlock
      if (action === 'lock') {
        if (!params) {
          return errorResponse('Missing params for lock action', 400, {
            required: ['params'],
          });
        }
        await lockCell(cellType, params, persist || false);
      } else {
        await unlockCell(cellType);
      }

      // Fetch updated configuration
      const config = await fetchCellLockConfig();

      return successResponse({
        ...config,
        message: `Cell ${action} successful for ${cellType.toUpperCase()}`,
      });
    } catch (error) {
      console.error('Error updating cell lock:', error);
      return errorResponse('Failed to update cell lock', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * Fetch cell lock configuration from modem
 */
async function fetchCellLockConfig(): Promise<CellLockConfig> {
  try {
    // Fetch LTE cell lock status
    const { stdout: lteLockOutput } = await execFileAsync('mmcli-atcmd', [
      'AT+QNWLOCK="common/4g"',
    ], { timeout: 10000 });

    // Fetch NR5G cell lock status
    const { stdout: nr5gLockOutput } = await execFileAsync('mmcli-atcmd', [
      'AT+QNWLOCK="common/5g"',
    ], { timeout: 10000 });

    // Fetch persist status
    const { stdout: persistOutput } = await execFileAsync('mmcli-atcmd', [
      'AT+QNWLOCK="common/persist"',
    ], { timeout: 10000 });

    // Parse cell lock configuration
    const lteParams = parseLTELock(lteLockOutput);
    const nr5gParams = parseNR5GLock(nr5gLockOutput);
    const { ltePersist, nr5gPersist } = parsePersistStatus(persistOutput);

    const lteLocked = !!(lteParams.EARFCN1 && lteParams.PCI1);
    const nr5gLocked = !!(nr5gParams.NRARFCN && nr5gParams.NRPCI);

    return {
      lteLocked,
      nr5gLocked,
      ltePersist,
      nr5gPersist,
      lteParams,
      nr5gParams,
    };
  } catch (error) {
    console.error('Error fetching cell lock config:', error);
    throw new Error('Failed to fetch cell lock configuration');
  }
}

/**
 * Parse LTE cell lock from AT command response
 */
function parseLTELock(response: string): LTECellLock {
  try {
    // Example response: +QNWLOCK: "common/4g",<freqcount>,<freq1>,<pci1>,<freq2>,<pci2>,<freq3>,<pci3>
    const match = response.match(
      /\+QNWLOCK:\s*"[^"]+",(\d+),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^\n]*)/
    );

    if (match) {
      return {
        EARFCN1: match[2] || '',
        PCI1: match[3] || '',
        EARFCN2: match[4] || '',
        PCI2: match[5] || '',
        EARFCN3: match[6] || '',
        PCI3: match[7]?.trim() || '',
      };
    }

    return {
      EARFCN1: '',
      PCI1: '',
      EARFCN2: '',
      PCI2: '',
      EARFCN3: '',
      PCI3: '',
    };
  } catch (error) {
    console.error('Error parsing LTE lock:', error);
    return {
      EARFCN1: '',
      PCI1: '',
      EARFCN2: '',
      PCI2: '',
      EARFCN3: '',
      PCI3: '',
    };
  }
}

/**
 * Parse NR5G cell lock from AT command response
 */
function parseNR5GLock(response: string): NR5GCellLock {
  try {
    // Example response: +QNWLOCK: "common/5g",<pci>,<freq>,<scs>,<band>
    const match = response.match(
      /\+QNWLOCK:\s*"[^"]+",([^,]*),([^,]*),([^,]*),([^\n]*)/
    );

    if (match) {
      return {
        NRPCI: match[1] || '',
        NRARFCN: match[2] || '',
        SCS: match[3] || '',
        NRBAND: match[4]?.trim() || '',
      };
    }

    return {
      NRARFCN: '',
      NRPCI: '',
      SCS: '',
      NRBAND: '',
    };
  } catch (error) {
    console.error('Error parsing NR5G lock:', error);
    return {
      NRARFCN: '',
      NRPCI: '',
      SCS: '',
      NRBAND: '',
    };
  }
}

/**
 * Parse persist status from AT command response
 */
function parsePersistStatus(response: string): {
  ltePersist: boolean;
  nr5gPersist: boolean;
} {
  try {
    // Example response: +QNWLOCK: "common/persist",<4g_persist>,<5g_persist>
    const match = response.match(/\+QNWLOCK:\s*"[^"]+",(\d+),(\d+)/);

    if (match) {
      return {
        ltePersist: match[1] === '1',
        nr5gPersist: match[2] === '1',
      };
    }

    return {
      ltePersist: false,
      nr5gPersist: false,
    };
  } catch (error) {
    console.error('Error parsing persist status:', error);
    return {
      ltePersist: false,
      nr5gPersist: false,
    };
  }
}

/**
 * Lock cell to specific parameters
 */
async function lockCell(
  cellType: 'lte' | 'nr5g',
  params: LTECellLock | NR5GCellLock,
  persist: boolean
): Promise<void> {
  try {
    if (cellType === 'lte') {
      const lteParams = params as LTECellLock;
      // Count number of cells to lock (up to 3)
      const freqCount = [
        lteParams.EARFCN1 && lteParams.PCI1,
        lteParams.EARFCN2 && lteParams.PCI2,
        lteParams.EARFCN3 && lteParams.PCI3,
      ].filter(Boolean).length;

      if (freqCount === 0) {
        throw new Error('At least one LTE cell must be specified');
      }

      // Build AT command
      const atCommand = `AT+QNWLOCK="common/4g",${freqCount},${lteParams.EARFCN1},${lteParams.PCI1},${lteParams.EARFCN2 || ''},${lteParams.PCI2 || ''},${lteParams.EARFCN3 || ''},${lteParams.PCI3 || ''}`;

      await execFileAsync('mmcli-atcmd', [atCommand], { timeout: 15000 });

      // Set persist if requested
      if (persist) {
        await execFileAsync('mmcli-atcmd', [
          `AT+QNWLOCK="common/persist",1,0`,
        ], { timeout: 10000 });
      }
    } else {
      // NR5G cell lock
      const nr5gParams = params as NR5GCellLock;

      if (!nr5gParams.NRARFCN || !nr5gParams.NRPCI) {
        throw new Error('NRARFCN and NRPCI must be specified for NR5G lock');
      }

      const atCommand = `AT+QNWLOCK="common/5g",${nr5gParams.NRPCI},${nr5gParams.NRARFCN},${nr5gParams.SCS || ''},${nr5gParams.NRBAND || ''}`;

      await execFileAsync('mmcli-atcmd', [atCommand], { timeout: 15000 });

      // Set persist if requested
      if (persist) {
        await execFileAsync('mmcli-atcmd', [
          `AT+QNWLOCK="common/persist",0,1`,
        ], { timeout: 10000 });
      }
    }
  } catch (error) {
    console.error('Error locking cell:', error);
    throw new Error(`Failed to lock ${cellType.toUpperCase()} cell`);
  }
}

/**
 * Unlock cell
 */
async function unlockCell(cellType: 'lte' | 'nr5g'): Promise<void> {
  try {
    if (cellType === 'lte') {
      await execFileAsync('mmcli-atcmd', ['AT+QNWLOCK="common/4g",0'], {
        timeout: 10000,
      });
    } else {
      await execFileAsync('mmcli-atcmd', ['AT+QNWLOCK="common/5g",0'], {
        timeout: 10000,
      });
    }
  } catch (error) {
    console.error('Error unlocking cell:', error);
    throw new Error(`Failed to unlock ${cellType.toUpperCase()} cell`);
  }
}
