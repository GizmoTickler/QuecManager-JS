/**
 * AT Command Executor
 *
 * Node.js implementation of AT command execution using sms_tool.
 * Replaces the shell-based at_queue_client.sh with a TypeScript implementation.
 *
 * Features:
 * - Secure command execution via execFile (no shell injection)
 * - Queue management with token-based locking
 * - Timeout handling
 * - Command validation
 * - Comprehensive error handling
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateATCommand } from '@/constants/at-command-whitelist';

const execFileAsync = promisify(execFile);

// Configuration
const QUEUE_DIR = '/tmp/at_queue';
const TOKEN_FILE = path.join(QUEUE_DIR, 'token');
const TOKEN_LOCK_DIR = path.join(QUEUE_DIR, 'token.lock');
const TOKEN_TIMEOUT = 30; // seconds
const LOCK_ACQUIRE_TIMEOUT = 100; // attempts (100 * 100ms = 10 seconds)
const DEFAULT_CMD_TIMEOUT = 3; // seconds
const MAX_TOKEN_ATTEMPTS = 50;

export interface ATCommandResult {
  command: string;
  response: string;
  status: 'success' | 'error';
  executionTime?: number;
}

export interface QueueToken {
  id: string;
  priority: number;
  timestamp: number;
}

/**
 * Custom error classes
 */
export class ATCommandError extends Error {
  constructor(
    message: string,
    public command?: string,
    public exitCode?: number
  ) {
    super(message);
    this.name = 'ATCommandError';
  }
}

export class TokenAcquisitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenAcquisitionError';
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensure queue directory exists
 */
async function ensureQueueDir(): Promise<void> {
  try {
    await fs.mkdir(QUEUE_DIR, { recursive: true, mode: 0o755 });
  } catch (error) {
    // Directory might already exist, ignore error
  }
}

/**
 * Acquire token lock atomically
 */
async function acquireTokenLock(): Promise<boolean> {
  for (let attempt = 0; attempt < LOCK_ACQUIRE_TIMEOUT; attempt++) {
    try {
      await fs.mkdir(TOKEN_LOCK_DIR, { mode: 0o755 });
      return true;
    } catch (error) {
      // Lock already held, wait and retry
      await sleep(100);
    }
  }
  return false;
}

/**
 * Release token lock
 */
async function releaseTokenLock(): Promise<void> {
  try {
    await fs.rmdir(TOKEN_LOCK_DIR);
  } catch (error) {
    // Ignore errors - lock might not exist
  }
}

/**
 * Get command priority
 */
function getCommandPriority(command: string): number {
  // QSCAN commands get high priority
  if (command.toUpperCase().includes('AT+QSCAN')) {
    return 1;
  }
  return 10;
}

/**
 * Read token file
 */
async function readToken(): Promise<QueueToken | null> {
  try {
    const data = await fs.readFile(TOKEN_FILE, 'utf-8');
    return JSON.parse(data) as QueueToken;
  } catch (error) {
    return null;
  }
}

/**
 * Write token file
 */
async function writeToken(token: QueueToken): Promise<void> {
  const data = JSON.stringify(token);
  await fs.writeFile(TOKEN_FILE, data, { mode: 0o644 });
}

/**
 * Acquire execution token
 */
async function acquireToken(priority: number): Promise<boolean> {
  await ensureQueueDir();

  const lockId = `AT_CLIENT_${Date.now()}_${process.pid}`;

  for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt++) {
    // Acquire atomic lock
    const locked = await acquireTokenLock();
    if (!locked) {
      console.error('Failed to acquire token lock');
      return false;
    }

    try {
      const currentToken = await readToken();
      const now = Math.floor(Date.now() / 1000);
      let shouldCreateToken = false;

      if (currentToken) {
        const age = now - currentToken.timestamp;

        // Check if token is expired
        if (age > TOKEN_TIMEOUT) {
          await fs.unlink(TOKEN_FILE);
          shouldCreateToken = true;
        }
        // Check if we have higher priority
        else if (priority < currentToken.priority) {
          console.log(`Preempting token: priority ${priority} > ${currentToken.priority}`);
          await fs.unlink(TOKEN_FILE);
          shouldCreateToken = true;
        } else {
          // Token held by higher/equal priority, retry
          await releaseTokenLock();
          await sleep(100);
          continue;
        }
      } else {
        shouldCreateToken = true;
      }

      // Create our token
      if (shouldCreateToken) {
        const newToken: QueueToken = {
          id: lockId,
          priority,
          timestamp: now,
        };

        await writeToken(newToken);

        // Verify we got the token
        const verifyToken = await readToken();
        if (verifyToken && verifyToken.id === lockId) {
          await releaseTokenLock();
          return true;
        }
      }

      await releaseTokenLock();
    } catch (error) {
      await releaseTokenLock();
      console.error('Error in token acquisition:', error);
    }

    await sleep(100);
  }

  return false;
}

/**
 * Release execution token
 */
async function releaseToken(lockId: string): Promise<void> {
  const locked = await acquireTokenLock();
  if (!locked) {
    console.error('Failed to acquire lock for token release');
    return;
  }

  try {
    const currentToken = await readToken();
    if (currentToken && currentToken.id === lockId) {
      await fs.unlink(TOKEN_FILE);
    }
  } catch (error) {
    // Ignore errors
  } finally {
    await releaseTokenLock();
  }
}

/**
 * Execute AT command via sms_tool
 */
async function executeSMSTool(
  command: string,
  timeout: number
): Promise<string> {
  const startTime = Date.now();

  try {
    // Use execFile for security - no shell injection possible
    const { stdout, stderr } = await execFileAsync(
      'sms_tool',
      ['at', command, '-t', timeout.toString()],
      {
        timeout: timeout * 1000 + 5000, // Add 5s buffer
        maxBuffer: 1024 * 1024, // 1MB buffer
      }
    );

    const executionTime = Date.now() - startTime;
    console.log(`Command executed in ${executionTime}ms: ${command}`);

    // Return stdout, stderr, or both
    return stdout || stderr || '';
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'killed' in error) {
      if (error.killed) {
        throw new ATCommandError('Command timeout', command, -1);
      }
    }

    const execError = error as { code?: number; stderr?: string; stdout?: string };
    throw new ATCommandError(
      execError.stderr || execError.stdout || 'Command execution failed',
      command,
      execError.code
    );
  }
}

/**
 * Normalize AT command
 */
function normalizeCommand(command: string): string {
  return command
    .replace(/[\r\n]/g, '')
    .trim();
}

/**
 * Execute single AT command with queue management
 *
 * @param command AT command to execute (e.g., "AT+CGSN")
 * @param timeout Timeout in seconds (default: 3)
 * @param skipValidation Skip whitelist validation (for internal use only)
 * @returns Command result
 */
export async function executeATCommand(
  command: string,
  timeout: number = DEFAULT_CMD_TIMEOUT,
  skipValidation: boolean = false
): Promise<ATCommandResult> {
  const startTime = Date.now();

  try {
    // Normalize command
    const normalizedCommand = normalizeCommand(command);

    // Validate command format
    if (!skipValidation) {
      const validation = validateATCommand(normalizedCommand);
      if (!validation.allowed) {
        throw new ATCommandError(
          validation.reason || 'Command not allowed',
          normalizedCommand
        );
      }
    }

    // Get priority
    const priority = getCommandPriority(normalizedCommand);

    // Special timeout for QSCAN
    if (normalizedCommand.toUpperCase().includes('AT+QSCAN')) {
      timeout = 200;
    }

    // Acquire token
    const lockId = `AT_CLIENT_${Date.now()}_${process.pid}`;
    const acquired = await acquireToken(priority);

    if (!acquired) {
      throw new TokenAcquisitionError('Failed to acquire execution token');
    }

    try {
      // Execute command
      const response = await executeSMSTool(normalizedCommand, timeout);

      return {
        command: normalizedCommand,
        response,
        status: 'success',
        executionTime: Date.now() - startTime,
      };
    } finally {
      // Always release token
      await releaseToken(lockId);
    }
  } catch (error) {
    if (error instanceof ATCommandError || error instanceof TokenAcquisitionError) {
      return {
        command: command,
        response: error.message,
        status: 'error',
        executionTime: Date.now() - startTime,
      };
    }

    return {
      command: command,
      response: error instanceof Error ? error.message : 'Unknown error',
      status: 'error',
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Execute batch of AT commands
 *
 * @param commands Array of AT commands
 * @param timeout Timeout per command in seconds
 * @param skipValidation Skip whitelist validation (for internal use only)
 * @returns Array of command results
 */
export async function executeBatchATCommands(
  commands: string[],
  timeout: number = DEFAULT_CMD_TIMEOUT,
  skipValidation: boolean = false
): Promise<ATCommandResult[]> {
  const results: ATCommandResult[] = [];

  // Validate all commands first
  if (!skipValidation) {
    for (const command of commands) {
      const normalizedCommand = normalizeCommand(command);
      const validation = validateATCommand(normalizedCommand);
      if (!validation.allowed) {
        results.push({
          command: normalizedCommand,
          response: validation.reason || 'Command not allowed',
          status: 'error',
        });
        return results;
      }
    }
  }

  // Acquire token once for all commands
  const priority = getCommandPriority(commands[0] || '');
  const lockId = `AT_CLIENT_${Date.now()}_${process.pid}`;
  const acquired = await acquireToken(priority);

  if (!acquired) {
    // Return error for all commands
    return commands.map((cmd) => ({
      command: cmd,
      response: 'Failed to acquire execution token',
      status: 'error',
    }));
  }

  try {
    // Execute all commands with the single token
    for (const command of commands) {
      const normalizedCommand = normalizeCommand(command);

      try {
        const response = await executeSMSTool(normalizedCommand, timeout);
        results.push({
          command: normalizedCommand,
          response,
          status: 'success',
        });
      } catch (error) {
        results.push({
          command: normalizedCommand,
          response: error instanceof Error ? error.message : 'Unknown error',
          status: 'error',
        });
      }
    }
  } finally {
    await releaseToken(lockId);
  }

  return results;
}

/**
 * Execute predefined command set (for data fetching)
 * This is used by the data fetching endpoints that need to execute
 * multiple AT commands efficiently
 */
export async function executeCommandSet(commands: string[]): Promise<ATCommandResult[]> {
  // Skip validation for internal command sets
  return executeBatchATCommands(commands, DEFAULT_CMD_TIMEOUT, true);
}

/**
 * Health check for AT command system
 */
export async function healthCheck(): Promise<{
  status: 'ok' | 'error';
  message: string;
  details?: unknown;
}> {
  try {
    // Try to execute a simple AT command
    const result = await executeATCommand('AT', 1, true);

    if (result.status === 'success') {
      return {
        status: 'ok',
        message: 'AT command system is operational',
        details: result,
      };
    } else {
      return {
        status: 'error',
        message: 'AT command system not responding',
        details: result,
      };
    }
  } catch (error) {
    return {
      status: 'error',
      message: 'AT command system error',
      details: error instanceof Error ? error.message : error,
    };
  }
}
