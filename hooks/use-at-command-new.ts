/**
 * AT Command Hook (New API)
 *
 * Uses the new Next.js API routes instead of CGI scripts
 * Migrated from: utils/at-command.ts
 *
 * Changes:
 * - Uses /api/modem/command instead of /cgi-bin/quecmanager/at_cmd/at_queue_client.sh
 * - Authentication via httpOnly cookies
 * - Better error handling and TypeScript types
 */

import { useState, useCallback } from 'react';

export interface ATCommandResult {
  command: string;
  response: string;
  status: 'success' | 'error';
  executionTime?: number;
}

export interface UseATCommandOptions {
  timeout?: number;
  onSuccess?: (result: ATCommandResult) => void;
  onError?: (error: string) => void;
}

export function useATCommandNew(options: UseATCommandOptions = {}) {
  const { timeout = 3, onSuccess, onError } = options;

  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<ATCommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Execute AT command
   */
  const executeCommand = useCallback(
    async (command: string, customTimeout?: number): Promise<ATCommandResult | null> => {
      setIsExecuting(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/modem/command?command=${encodeURIComponent(command)}&timeout=${customTimeout || timeout}`,
          {
            method: 'GET',
            credentials: 'include', // Include httpOnly cookie
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        const data = await response.json();

        if (response.ok && data.status === 'success') {
          const result: ATCommandResult = {
            command: data.data.command,
            response: data.data.response,
            status: 'success',
            executionTime: data.data.executionTime,
          };

          setLastResult(result);
          onSuccess?.(result);
          return result;
        } else {
          const errorMsg = data.error || 'Command execution failed';
          setError(errorMsg);
          onError?.(errorMsg);
          return null;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Network error';
        setError(errorMsg);
        onError?.(errorMsg);
        return null;
      } finally {
        setIsExecuting(false);
      }
    },
    [timeout, onSuccess, onError]
  );

  /**
   * Execute AT command using POST (alternative)
   */
  const executeCommandPost = useCallback(
    async (command: string, customTimeout?: number): Promise<ATCommandResult | null> => {
      setIsExecuting(true);
      setError(null);

      try {
        const response = await fetch('/api/modem/command', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            command,
            timeout: customTimeout || timeout,
          }),
        });

        const data = await response.json();

        if (response.ok && data.status === 'success') {
          const result: ATCommandResult = {
            command: data.data.command,
            response: data.data.response,
            status: 'success',
            executionTime: data.data.executionTime,
          };

          setLastResult(result);
          onSuccess?.(result);
          return result;
        } else {
          const errorMsg = data.error || 'Command execution failed';
          setError(errorMsg);
          onError?.(errorMsg);
          return null;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Network error';
        setError(errorMsg);
        onError?.(errorMsg);
        return null;
      } finally {
        setIsExecuting(false);
      }
    },
    [timeout, onSuccess, onError]
  );

  return {
    executeCommand,
    executeCommandPost,
    isExecuting,
    lastResult,
    error,
  };
}

/**
 * Migration note:
 *
 * To migrate from old at-command.ts:
 *
 * 1. Replace utility function with hook:
 *    - Old: import { atCommandSender } from '@/utils/at-command'
 *    - New: import { useATCommandNew } from '@/hooks/use-at-command-new'
 *
 * 2. Usage in component:
 *    const { executeCommand, isExecuting, error } = useATCommandNew();
 *
 * 3. Execute command:
 *    const result = await executeCommand('AT+CGSN');
 *
 * 4. For non-hook usage, you can still use fetch directly:
 *    const response = await fetch('/api/modem/command?command=AT+CGSN', {
 *      credentials: 'include'
 *    });
 */
