/**
 * Network Settings API
 *
 * Provides endpoints for managing network configuration.
 * Supports hostname, DNS, and basic network settings.
 *
 * @module api/settings/network
 */

import { NextRequest } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { requireAuth, successResponse, errorResponse } from '@/lib/middleware/auth-middleware';

const execFileAsync = promisify(execFile);

interface NetworkSettings {
  hostname: string;
  dns: {
    primary: string;
    secondary: string;
  };
  ipAddress: string;
  gateway: string;
  netmask: string;
}

/**
 * GET /api/settings/network
 *
 * Get current network settings
 *
 * @returns {Object} JSON response with network configuration
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const settings = await getNetworkSettings();

      return successResponse(settings);
    } catch (error) {
      console.error('Error fetching network settings:', error);
      return errorResponse('Failed to fetch network settings', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * POST /api/settings/network
 *
 * Update network settings
 *
 * Body parameters:
 * - hostname: System hostname (optional)
 * - dns: DNS configuration (optional)
 *   - primary: Primary DNS server
 *   - secondary: Secondary DNS server
 *
 * @returns {Object} JSON response with updated settings
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      const body = await request.json();
      const { hostname, dns } = body;

      // Update hostname if provided
      if (hostname) {
        await setHostname(hostname);
      }

      // Update DNS if provided
      if (dns) {
        if (dns.primary || dns.secondary) {
          await setDNS(dns.primary, dns.secondary);
        }
      }

      // Get updated settings
      const settings = await getNetworkSettings();

      return successResponse({
        ...settings,
        message: 'Network settings updated successfully',
      });
    } catch (error) {
      console.error('Error updating network settings:', error);
      return errorResponse('Failed to update network settings', 500, {
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * Get current network settings
 */
async function getNetworkSettings(): Promise<NetworkSettings> {
  try {
    // Get hostname
    const { stdout: hostnameOutput } = await execFileAsync('hostname', [], {
      timeout: 5000,
    });
    const hostname = hostnameOutput.trim();

    // Get DNS servers from /etc/resolv.conf
    let primaryDNS = '';
    let secondaryDNS = '';

    try {
      const resolvConf = await fs.readFile('/etc/resolv.conf', 'utf-8');
      const nameservers = resolvConf
        .split('\n')
        .filter((line) => line.startsWith('nameserver'))
        .map((line) => line.split(/\s+/)[1]);

      primaryDNS = nameservers[0] || '';
      secondaryDNS = nameservers[1] || '';
    } catch (error) {
      console.error('Error reading resolv.conf:', error);
    }

    // Get IP address, gateway, netmask using 'ip' command
    let ipAddress = '';
    let gateway = '';
    let netmask = '';

    try {
      // Get IP address and netmask
      const { stdout: ipOutput } = await execFileAsync('ip', [
        'addr',
        'show',
        'dev',
        'eth0',
      ], { timeout: 5000 });

      const ipMatch = ipOutput.match(/inet (\d+\.\d+\.\d+\.\d+)\/(\d+)/);
      if (ipMatch) {
        ipAddress = ipMatch[1];
        // Convert CIDR to netmask
        const cidr = parseInt(ipMatch[2]);
        netmask = cidrToNetmask(cidr);
      }

      // Get gateway
      const { stdout: routeOutput } = await execFileAsync('ip', [
        'route',
        'show',
        'default',
      ], { timeout: 5000 });

      const gatewayMatch = routeOutput.match(/default via (\d+\.\d+\.\d+\.\d+)/);
      if (gatewayMatch) {
        gateway = gatewayMatch[1];
      }
    } catch (error) {
      console.error('Error getting IP configuration:', error);
    }

    return {
      hostname,
      dns: {
        primary: primaryDNS,
        secondary: secondaryDNS,
      },
      ipAddress,
      gateway,
      netmask,
    };
  } catch (error) {
    console.error('Error getting network settings:', error);
    throw new Error('Failed to get network settings');
  }
}

/**
 * Set system hostname
 */
async function setHostname(hostname: string): Promise<void> {
  try {
    // Validate hostname
    if (!/^[a-zA-Z0-9-]+$/.test(hostname)) {
      throw new Error('Invalid hostname format');
    }

    // Set hostname using hostname command
    await execFileAsync('hostname', [hostname], { timeout: 5000 });

    // Update /etc/hostname
    await fs.writeFile('/etc/hostname', hostname + '\n');

    // For OpenWRT, also update UCI
    try {
      await execFileAsync('uci', [
        'set',
        `system.@system[0].hostname=${hostname}`,
      ], { timeout: 5000 });

      await execFileAsync('uci', ['commit', 'system'], { timeout: 5000 });
    } catch (error) {
      // UCI may not be available on all systems
      console.warn('UCI not available for hostname update:', error);
    }
  } catch (error) {
    console.error('Error setting hostname:', error);
    throw new Error('Failed to set hostname');
  }
}

/**
 * Set DNS servers
 */
async function setDNS(primary?: string, secondary?: string): Promise<void> {
  try {
    // Validate DNS addresses
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;

    if (primary && !ipPattern.test(primary)) {
      throw new Error('Invalid primary DNS address');
    }

    if (secondary && !ipPattern.test(secondary)) {
      throw new Error('Invalid secondary DNS address');
    }

    // Build resolv.conf content
    let resolvConf = '';

    if (primary) {
      resolvConf += `nameserver ${primary}\n`;
    }

    if (secondary) {
      resolvConf += `nameserver ${secondary}\n`;
    }

    // Write to /etc/resolv.conf
    if (resolvConf) {
      await fs.writeFile('/etc/resolv.conf', resolvConf);
    }

    // For OpenWRT, also update UCI
    try {
      if (primary) {
        await execFileAsync('uci', [
          'set',
          `network.lan.dns=${primary}${secondary ? ' ' + secondary : ''}`,
        ], { timeout: 5000 });

        await execFileAsync('uci', ['commit', 'network'], { timeout: 5000 });
      }
    } catch (error) {
      // UCI may not be available on all systems
      console.warn('UCI not available for DNS update:', error);
    }
  } catch (error) {
    console.error('Error setting DNS:', error);
    throw new Error('Failed to set DNS');
  }
}

/**
 * Convert CIDR to netmask
 */
function cidrToNetmask(cidr: number): string {
  const mask = ~((1 << (32 - cidr)) - 1);
  return [
    (mask >>> 24) & 0xff,
    (mask >>> 16) & 0xff,
    (mask >>> 8) & 0xff,
    mask & 0xff,
  ].join('.');
}
