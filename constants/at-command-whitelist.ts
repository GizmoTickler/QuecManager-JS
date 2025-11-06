/**
 * AT Command Whitelist Configuration
 *
 * This file defines safe AT commands that can be executed from the AT terminal.
 * Commands are categorized by their function and risk level.
 */

export type ATCommandCategory =
  | 'query'      // Read-only queries
  | 'config'     // Configuration commands
  | 'network'    // Network operations
  | 'restricted' // Potentially dangerous commands
  | 'diagnostic'; // Diagnostic commands

export interface ATCommandRule {
  pattern: RegExp;
  category: ATCommandCategory;
  description: string;
  requiresConfirmation?: boolean;
  maxExecutionTime?: number; // in seconds
}

/**
 * Whitelist of allowed AT commands
 * Commands not matching any pattern will be rejected
 */
export const AT_COMMAND_WHITELIST: ATCommandRule[] = [
  // ============ QUERY COMMANDS (Safe, read-only) ============
  {
    pattern: /^AT\+CGSN(\?)?$/i,
    category: 'query',
    description: 'Query IMEI',
  },
  {
    pattern: /^AT\+CIMI(\?)?$/i,
    category: 'query',
    description: 'Query IMSI',
  },
  {
    pattern: /^AT\+ICCID(\?)?$/i,
    category: 'query',
    description: 'Query SIM card ICCID',
  },
  {
    pattern: /^AT\+CNUM(\?)?$/i,
    category: 'query',
    description: 'Query phone number',
  },
  {
    pattern: /^AT\+CPIN\?$/i,
    category: 'query',
    description: 'Query SIM PIN status',
  },
  {
    pattern: /^AT\+CSQ(\?)?$/i,
    category: 'query',
    description: 'Query signal quality',
  },
  {
    pattern: /^AT\+COPS\?$/i,
    category: 'query',
    description: 'Query operator selection',
  },
  {
    pattern: /^AT\+CREG\?$/i,
    category: 'query',
    description: 'Query network registration',
  },
  {
    pattern: /^AT\+CEREG\?$/i,
    category: 'query',
    description: 'Query EPS network registration',
  },
  {
    pattern: /^AT\+CGDCONT\?$/i,
    category: 'query',
    description: 'Query PDP context',
  },
  {
    pattern: /^AT\+CGACT\?$/i,
    category: 'query',
    description: 'Query PDP context state',
  },
  {
    pattern: /^AT\+QENG="servingcell"$/i,
    category: 'query',
    description: 'Query serving cell info',
  },
  {
    pattern: /^AT\+QENG="neighbourcell"$/i,
    category: 'query',
    description: 'Query neighbour cell info',
  },
  {
    pattern: /^AT\+QCAINFO$/i,
    category: 'query',
    description: 'Query carrier aggregation info',
  },
  {
    pattern: /^AT\+QNWINFO(\?)?$/i,
    category: 'query',
    description: 'Query network info',
  },
  {
    pattern: /^AT\+QSPN$/i,
    category: 'query',
    description: 'Query service provider name',
  },
  {
    pattern: /^AT\+QTEMP(\?)?$/i,
    category: 'query',
    description: 'Query temperature',
  },
  {
    pattern: /^AT\+QGMR(\?)?$/i,
    category: 'query',
    description: 'Query firmware version',
  },
  {
    pattern: /^AT\+QHWCFG="version"$/i,
    category: 'query',
    description: 'Query hardware version',
  },
  {
    pattern: /^AT\+QUIMSLOT\?$/i,
    category: 'query',
    description: 'Query SIM slot',
  },
  {
    pattern: /^AT\+QMBNCFG="list"$/i,
    category: 'query',
    description: 'Query MBN configuration list',
  },
  {
    pattern: /^AT\+QNWPREFCFG="[^"]*"$/i,
    category: 'query',
    description: 'Query network preference',
  },
  {
    pattern: /^AT\+QNWLOCK="[^"]*"$/i,
    category: 'query',
    description: 'Query network lock status',
  },
  {
    pattern: /^AT\+QMAP="[^"]*"$/i,
    category: 'query',
    description: 'Query QMAP settings',
  },

  // ============ DIAGNOSTIC COMMANDS ============
  {
    pattern: /^AT\+QPING=\d+,"[^"]+",\d+,\d+$/i,
    category: 'diagnostic',
    description: 'Execute ping test',
    maxExecutionTime: 60,
  },
  {
    pattern: /^AT\+QNWCFG="[^"]*"(\?)?$/i,
    category: 'diagnostic',
    description: 'Query network configuration',
  },

  // ============ NETWORK CONFIGURATION ============
  {
    pattern: /^AT\+COPS=0$/i,
    category: 'network',
    description: 'Auto network selection',
    requiresConfirmation: true,
  },
  {
    pattern: /^AT\+COPS=2$/i,
    category: 'network',
    description: 'Deregister from network',
    requiresConfirmation: true,
  },
  {
    pattern: /^AT\+CFUN=\d+$/i,
    category: 'network',
    description: 'Set phone functionality',
    requiresConfirmation: true,
  },

  // ============ CONFIGURATION COMMANDS ============
  {
    pattern: /^AT\+CGDCONT=\d+,"[^"]+","[^"]+"(,"[^"]*"){0,7}$/i,
    category: 'config',
    description: 'Define PDP context',
    requiresConfirmation: true,
  },
  {
    pattern: /^AT\+QICSGP=\d+(,"[^"]*"){0,5}$/i,
    category: 'config',
    description: 'Set APN parameters',
    requiresConfirmation: true,
  },
  {
    pattern: /^AT\+QNWPREFCFG="[^"]+",\d+(,\d+)*$/i,
    category: 'config',
    description: 'Configure network preference',
    requiresConfirmation: true,
  },
  {
    pattern: /^AT\+QNWLOCK="[^"]+"(,[^,]+)*$/i,
    category: 'config',
    description: 'Configure network lock',
    requiresConfirmation: true,
  },

  // ============ RESTRICTED COMMANDS (Require confirmation) ============
  {
    pattern: /^AT\+QPOWD=0$/i,
    category: 'restricted',
    description: 'Normal power down',
    requiresConfirmation: true,
  },
  {
    pattern: /^AT\+QPOWD=1$/i,
    category: 'restricted',
    description: 'Reboot modem',
    requiresConfirmation: true,
  },
  {
    pattern: /^AT\+QSCAN=\d+(,\d+)?$/i,
    category: 'restricted',
    description: 'Network scan (may take several minutes)',
    requiresConfirmation: true,
    maxExecutionTime: 240,
  },
];

/**
 * Commands that are completely forbidden
 * These commands could brick the device or cause security issues
 */
export const FORBIDDEN_AT_COMMANDS: RegExp[] = [
  /AT\+QFASTBOOT/i,         // Emergency download mode
  /AT\+QPRTPARA/i,          // Write production parameters
  /AT\+QFOTADL/i,           // FOTA download (should use proper UI)
  /AT\$QCRMCALL/i,          // RmNet call configuration (advanced)
  /AT\+QLINUXCMD/i,         // Execute Linux commands (major security risk)
  /AT\+QSHELL/i,            // Shell access
];

/**
 * Validate an AT command against the whitelist
 * @param command The AT command to validate
 * @returns Object with validation result and metadata
 */
export function validateATCommand(command: string): {
  allowed: boolean;
  rule?: ATCommandRule;
  reason?: string;
} {
  // Normalize command
  const normalized = command.trim();

  // Check if command is too long (prevent buffer overflow)
  if (normalized.length > 256) {
    return {
      allowed: false,
      reason: 'Command exceeds maximum length (256 characters)',
    };
  }

  // Check if command starts with AT
  if (!normalized.match(/^AT/i)) {
    return {
      allowed: false,
      reason: 'Command must start with "AT"',
    };
  }

  // Check against forbidden commands first
  for (const forbiddenPattern of FORBIDDEN_AT_COMMANDS) {
    if (forbiddenPattern.test(normalized)) {
      return {
        allowed: false,
        reason: 'This command is forbidden for security reasons',
      };
    }
  }

  // Check against whitelist
  for (const rule of AT_COMMAND_WHITELIST) {
    if (rule.pattern.test(normalized)) {
      return {
        allowed: true,
        rule,
      };
    }
  }

  // Command not in whitelist
  return {
    allowed: false,
    reason: 'Command not in whitelist. Only safe, approved commands are allowed.',
  };
}

/**
 * Get a list of commonly used commands for autocomplete/help
 */
export function getCommonCommands(): Array<{
  command: string;
  description: string;
  category: ATCommandCategory;
}> {
  return [
    { command: 'AT+CGSN', description: 'Query IMEI', category: 'query' },
    { command: 'AT+CIMI', description: 'Query IMSI', category: 'query' },
    { command: 'AT+ICCID', description: 'Query ICCID', category: 'query' },
    { command: 'AT+CSQ', description: 'Signal Quality', category: 'query' },
    { command: 'AT+COPS?', description: 'Operator Selection', category: 'query' },
    { command: 'AT+QENG="servingcell"', description: 'Serving Cell Info', category: 'query' },
    { command: 'AT+QCAINFO', description: 'Carrier Aggregation Info', category: 'query' },
    { command: 'AT+QTEMP', description: 'Temperature', category: 'query' },
    { command: 'AT+QNWINFO', description: 'Network Info', category: 'query' },
  ];
}
