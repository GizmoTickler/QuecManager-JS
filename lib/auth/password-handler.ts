/**
 * Password Handler
 *
 * Password authentication against system shadow file.
 * Ports the functionality from auth.sh to Node.js.
 *
 * Security features:
 * - Input validation
 * - Rate limiting
 * - Secure password comparison
 * - No password leakage in errors
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';

const execFileAsync = promisify(execFile);

/**
 * Validate password format
 */
export function validatePassword(password: string): {
  valid: boolean;
  error?: string;
} {
  // Check length
  if (password.length < 1 || password.length > 128) {
    return {
      valid: false,
      error: 'Password length must be between 1 and 128 characters',
    };
  }

  // Check for forbidden characters (shell metacharacters)
  if (/[$`&|;<>(){}\\]/.test(password)) {
    return {
      valid: false,
      error: 'Password contains forbidden characters',
    };
  }

  return { valid: true };
}

/**
 * Get user's password hash from /etc/shadow
 */
async function getShadowHash(username: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('grep', [
      `^${username}:`,
      '/etc/shadow',
    ]);

    const fields = stdout.trim().split(':');
    if (fields.length >= 2) {
      return fields[1]; // Second field is the password hash
    }

    return null;
  } catch (error) {
    console.error('Error reading shadow file:', error);
    return null;
  }
}

/**
 * Hash password using OpenSSL (compatible with system passwd)
 */
async function hashPasswordOpenSSL(password: string, salt: string): Promise<string> {
  try {
    // Use OpenSSL to hash password with MD5 (for compatibility with /etc/shadow)
    // Note: We pass password via command line since execFile doesn't support stdin piping
    // This is less ideal but necessary for this implementation
    const { spawn } = await import('child_process');

    return new Promise<string>((resolve, reject) => {
      const openssl = spawn('openssl', [
        'passwd',
        '-1',
        '-salt',
        salt,
        '-stdin',
      ]);

      let stdout = '';
      let stderr = '';

      openssl.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      openssl.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      openssl.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`OpenSSL failed: ${stderr}`));
        }
      });

      openssl.on('error', (error) => {
        reject(error);
      });

      // Write password to stdin
      openssl.stdin.write(password);
      openssl.stdin.end();
    });
  } catch (error) {
    throw new Error('Password hashing failed');
  }
}

/**
 * Verify password against system shadow file
 */
export async function verifyPassword(
  username: string,
  password: string
): Promise<boolean> {
  try {
    // Validate password format first
    const validation = validatePassword(password);
    if (!validation.valid) {
      return false;
    }

    // Get hash from shadow file
    const shadowHash = await getShadowHash(username);
    if (!shadowHash) {
      return false;
    }

    // Extract salt from shadow hash
    // MD5 hash format: $1$SALT$HASH
    const parts = shadowHash.split('$');
    if (parts.length < 4 || parts[1] !== '1') {
      return false;
    }

    const salt = parts[2];

    // Hash the provided password with the same salt
    const computedHash = await hashPasswordOpenSSL(password, salt);

    // Constant-time comparison
    return crypto.timingSafeEqual(
      Buffer.from(computedHash),
      Buffer.from(shadowHash)
    );
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

/**
 * Rate limiting for login attempts
 */
interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

/**
 * Check if IP is rate limited
 */
export function checkRateLimit(ip: string): {
  allowed: boolean;
  remainingAttempts?: number;
  resetTime?: number;
} {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry) {
    // First attempt
    rateLimitMap.set(ip, {
      attempts: 1,
      firstAttempt: now,
      lastAttempt: now,
    });

    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - 1,
    };
  }

  // Check if window has expired
  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW) {
    // Reset
    rateLimitMap.set(ip, {
      attempts: 1,
      firstAttempt: now,
      lastAttempt: now,
    });

    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - 1,
    };
  }

  // Check if limit exceeded
  if (entry.attempts >= MAX_ATTEMPTS) {
    const resetTime = entry.firstAttempt + RATE_LIMIT_WINDOW;

    return {
      allowed: false,
      resetTime,
    };
  }

  // Increment attempts
  entry.attempts += 1;
  entry.lastAttempt = now;
  rateLimitMap.set(ip, entry);

  return {
    allowed: true,
    remainingAttempts: MAX_ATTEMPTS - entry.attempts,
  };
}

/**
 * Clean up old rate limit entries (call periodically)
 */
export function cleanupRateLimitMap(): void {
  const now = Date.now();

  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.firstAttempt > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(ip);
    }
  }
}

// Clean up every 5 minutes
setInterval(cleanupRateLimitMap, 5 * 60 * 1000);
