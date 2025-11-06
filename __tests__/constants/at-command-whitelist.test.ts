/**
 * Tests for AT Command Whitelist
 */

import {
  validateATCommand,
  getCommonCommands,
  AT_COMMAND_WHITELIST,
  FORBIDDEN_AT_COMMANDS,
} from '@/constants/at-command-whitelist';

describe('AT Command Whitelist', () => {
  describe('validateATCommand', () => {
    describe('valid commands', () => {
      it('should allow whitelisted query commands', () => {
        const validCommands = [
          'AT+CGSN',
          'AT+CGSN?',
          'AT+CIMI',
          'AT+CIMI?',
          'AT+ICCID',
          'AT+CSQ',
          'AT+CSQ?',
          'AT+COPS?',
        ];

        validCommands.forEach((command) => {
          const result = validateATCommand(command);
          expect(result.allowed).toBe(true);
          expect(result.rule).toBeDefined();
        });
      });

      it('should allow network configuration commands', () => {
        const result = validateATCommand('AT+COPS=0');

        expect(result.allowed).toBe(true);
        expect(result.rule?.requiresConfirmation).toBe(true);
      });

      it('should handle case insensitivity', () => {
        const commands = ['AT+CGSN', 'at+cgsn', 'At+CgSn'];

        commands.forEach((command) => {
          const result = validateATCommand(command);
          expect(result.allowed).toBe(true);
        });
      });
    });

    describe('invalid commands', () => {
      it('should reject commands not starting with AT', () => {
        const result = validateATCommand('INVALID_COMMAND');

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('must start with "AT"');
      });

      it('should reject commands exceeding max length', () => {
        const longCommand = 'AT+' + 'X'.repeat(300);
        const result = validateATCommand(longCommand);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('maximum length');
      });

      it('should reject forbidden commands', () => {
        const forbiddenCommands = [
          'AT+QFASTBOOT',
          'AT+QPRTPARA',
          'AT+QLINUXCMD',
        ];

        forbiddenCommands.forEach((command) => {
          const result = validateATCommand(command);
          expect(result.allowed).toBe(false);
          expect(result.reason).toContain('forbidden');
        });
      });

      it('should reject commands not in whitelist', () => {
        const result = validateATCommand('AT+NOTINWHITELIST');

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('not in whitelist');
      });
    });

    describe('command categories', () => {
      it('should require confirmation for dangerous commands', () => {
        const dangerousCommands = [
          'AT+QPOWD=0',
          'AT+QPOWD=1',
          'AT+QSCAN=1',
        ];

        dangerousCommands.forEach((command) => {
          const result = validateATCommand(command);
          expect(result.allowed).toBe(true);
          expect(result.rule?.requiresConfirmation).toBe(true);
        });
      });

      it('should not require confirmation for query commands', () => {
        const queryCommands = [
          'AT+CGSN',
          'AT+CIMI',
          'AT+CSQ',
        ];

        queryCommands.forEach((command) => {
          const result = validateATCommand(command);
          expect(result.allowed).toBe(true);
          expect(result.rule?.requiresConfirmation).toBeUndefined();
        });
      });
    });

    describe('edge cases', () => {
      it('should handle whitespace in commands', () => {
        const result = validateATCommand('  AT+CGSN  ');

        expect(result.allowed).toBe(true);
      });

      it('should handle empty command', () => {
        const result = validateATCommand('');

        expect(result.allowed).toBe(false);
      });

      it('should handle special characters', () => {
        const result = validateATCommand('AT+QENG="servingcell"');

        expect(result.allowed).toBe(true);
      });
    });
  });

  describe('getCommonCommands', () => {
    it('should return array of common commands', () => {
      const commands = getCommonCommands();

      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBeGreaterThan(0);
    });

    it('should include command metadata', () => {
      const commands = getCommonCommands();

      commands.forEach((cmd) => {
        expect(cmd).toHaveProperty('command');
        expect(cmd).toHaveProperty('description');
        expect(cmd).toHaveProperty('category');
      });
    });

    it('should only include query commands', () => {
      const commands = getCommonCommands();

      commands.forEach((cmd) => {
        expect(cmd.category).toBe('query');
      });
    });
  });

  describe('whitelist configuration', () => {
    it('should have properly configured whitelist entries', () => {
      expect(AT_COMMAND_WHITELIST.length).toBeGreaterThan(0);

      AT_COMMAND_WHITELIST.forEach((rule) => {
        expect(rule).toHaveProperty('pattern');
        expect(rule).toHaveProperty('category');
        expect(rule).toHaveProperty('description');
        expect(rule.pattern).toBeInstanceOf(RegExp);
      });
    });

    it('should have forbidden command patterns', () => {
      expect(FORBIDDEN_AT_COMMANDS.length).toBeGreaterThan(0);

      FORBIDDEN_AT_COMMANDS.forEach((pattern) => {
        expect(pattern).toBeInstanceOf(RegExp);
      });
    });
  });
});
