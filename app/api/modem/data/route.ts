/**
 * Modem Data Fetching API Route
 *
 * GET /api/modem/data?set=1
 *
 * Fetches modem data by executing predefined command sets
 *
 * Replaces: /cgi-bin/quecmanager/at_cmd/fetch_data.sh
 */

import { NextRequest } from 'next/server';
import { requireAuth, errorResponse, successResponse } from '@/lib/middleware/auth-middleware';
import { executeCommandSet } from '@/lib/modem/at-command-executor';

// Predefined command sets (from fetch_data.sh)
const COMMAND_SETS: Record<number, string[]> = {
  1: [
    'AT+QUIMSLOT?',
    'AT+CNUM',
    'AT+COPS?',
    'AT+CIMI',
    'AT+ICCID',
    'AT+CGSN',
    'AT+CPIN?',
    'AT+CGDCONT?',
    'AT+CREG?',
    'AT+CFUN?',
    'AT+QENG="servingcell"',
    'AT+QTEMP',
    'AT+CGCONTRDP',
    'AT+QCAINFO=1;+QCAINFO;+QCAINFO=0',
    'AT+QRSRP',
    'AT+QMAP="WWAN"',
    'AT+C5GREG=2;+C5GREG?',
    'AT+CGREG=2;+CGREG?',
    'AT+QRSRQ',
    'AT+QSINR',
    'AT+CGCONTRDP',
    'AT+QNWCFG="lte_time_advance",1;+QNWCFG="lte_time_advance"',
    'AT+QNWCFG="nr5g_time_advance",1;+QNWCFG="nr5g_time_advance"',
  ],
  2: [
    'AT+CGDCONT?',
    'AT+CGCONTRDP',
    'AT+QNWPREFCFG="mode_pref"',
    'AT+QNWPREFCFG="nr5g_disable_mode"',
    'AT+QUIMSLOT?',
    'AT+CFUN?',
    'AT+QMBNCFG="AutoSel"',
    'AT+QMBNCFG="list"',
    'AT+QMAP="WWAN"',
    'AT+QNWCFG="lte_ambr"',
    'AT+QNWCFG="nr5g_ambr"',
  ],
  3: [
    'AT+CGMI',
    'AT+CGMM',
    'AT+QGMR',
    'AT+CNUM',
    'AT+CIMI',
    'AT+ICCID',
    'AT+CGSN',
    'AT+QMAP="LANIP"',
    'AT+QMAP="WWAN"',
    'AT+QGETCAPABILITY',
    'AT+QNWCFG="3gpp_rel"',
  ],
  4: [
    'AT+QMAP="MPDN_RULE"',
    'AT+QMAP="DHCPV4DNS"',
    'AT+QCFG="usbnet"',
  ],
  5: [
    'AT+QRSRP',
    'AT+QRSRQ',
    'AT+QSINR',
    'AT+QCAINFO',
    'AT+QSPN',
  ],
  6: [
    'AT+CEREG=2;+CEREG?',
    'AT+C5GREG=2;+C5GREG?',
    'AT+CPIN?',
    'AT+CGDCONT?',
    'AT+CGCONTRDP',
    'AT+QMAP="WWAN"',
    'AT+QRSRP',
    'AT+QTEMP',
    'AT+QNETRC?',
  ],
  7: [
    'AT+QNWPREFCFG="policy_band"',
    'AT+QNWPREFCFG="lte_band";+QNWPREFCFG="nsa_nr5g_band";+QNWPREFCFG="nr5g_band"',
  ],
  8: [
    'AT+QNWLOCK="common/4g"',
    'AT+QNWLOCK="common/5g"',
    'AT+QNWLOCK="save_ctrl"',
  ],
  9: [
    'AT+ICCID',
    'AT+CGSN',
    'AT+QUIMSLOT?',
  ],
  10: [
    'AT+QNWPREFCFG="rat_acq_order"',
  ],
};

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      // Get command set number from query string
      const searchParams = req.nextUrl.searchParams;
      const setParam = searchParams.get('set');

      // Parse and validate set number
      const setNumber = setParam ? parseInt(setParam, 10) : 1;

      if (isNaN(setNumber) || setNumber < 1 || setNumber > 10) {
        return errorResponse('Invalid set parameter (must be 1-10)', 400);
      }

      // Get command set
      const commands = COMMAND_SETS[setNumber];

      if (!commands) {
        return errorResponse(`Command set ${setNumber} not found`, 404);
      }

      // Execute command set
      const results = await executeCommandSet(commands);

      // Return results
      return successResponse({
        set: setNumber,
        commands: results,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Data fetching error:', error);
      return errorResponse('Data fetching failed', 500);
    }
  });
}
