/**
 * AT Command Execution API Route
 *
 * GET /api/modem/command?command=AT+CGSN&timeout=3
 * POST /api/modem/command with JSON body { command, timeout }
 *
 * Executes a single AT command
 *
 * Replaces: /cgi-bin/quecmanager/at_cmd/at_queue_client.sh
 */

import { NextRequest } from 'next/server';
import { requireAuth, errorResponse, successResponse } from '@/lib/middleware/auth-middleware';
import { executeATCommand } from '@/lib/modem/at-command-executor';

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      // Get command from query string
      const searchParams = req.nextUrl.searchParams;
      const command = searchParams.get('command');
      const timeoutParam = searchParams.get('timeout');

      // Validate command exists
      if (!command) {
        return errorResponse('Command parameter is required', 400);
      }

      // Parse timeout
      const timeout = timeoutParam ? parseInt(timeoutParam, 10) : 3;

      if (isNaN(timeout) || timeout < 1 || timeout > 300) {
        return errorResponse('Invalid timeout parameter (must be 1-300 seconds)', 400);
      }

      // Execute command
      const result = await executeATCommand(command, timeout);

      // Return result
      if (result.status === 'success') {
        return successResponse({
          command: result.command,
          response: result.response,
          status: result.status,
          executionTime: result.executionTime,
        });
      } else {
        return errorResponse(result.response, 400, {
          command: result.command,
          status: result.status,
        });
      }
    } catch (error) {
      console.error('AT command execution error:', error);
      return errorResponse('Command execution failed', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req) => {
    try {
      // Parse JSON body
      const body = await req.json();
      const { command, timeout = 3 } = body;

      // Validate command exists
      if (!command) {
        return errorResponse('Command is required', 400);
      }

      // Validate timeout
      if (typeof timeout !== 'number' || timeout < 1 || timeout > 300) {
        return errorResponse('Invalid timeout (must be 1-300 seconds)', 400);
      }

      // Execute command
      const result = await executeATCommand(command, timeout);

      // Return result
      if (result.status === 'success') {
        return successResponse({
          command: result.command,
          response: result.response,
          status: result.status,
          executionTime: result.executionTime,
        });
      } else {
        return errorResponse(result.response, 400, {
          command: result.command,
          status: result.status,
        });
      }
    } catch (error) {
      console.error('AT command execution error:', error);
      return errorResponse('Command execution failed', 500);
    }
  });
}
