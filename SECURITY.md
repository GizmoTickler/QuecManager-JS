# Security Documentation

## Overview

QuecManager-JS is a Next.js-based web application for managing Quectel modems running on OpenWRT. This document outlines the security measures implemented, potential risks, and best practices for maintaining the security of the application.

## Recent Security Improvements (2025)

### Critical Vulnerabilities Fixed

1. **Command Injection via eval() (CVE-LEVEL: CRITICAL)**
   - **Location**: `scripts/cgi-bin/quecmanager/at_cmd/at_queue_client.sh:358`, `scripts/cgi-bin/services/at_queue_manager.sh:695`
   - **Issue**: Direct shell code injection through unsanitized `$QUERY_STRING`
   - **Fix**: Replaced `eval $(echo "$QUERY_STRING" | sed 's/&/;/g')` with safe parameter parsing using `parse_query_string()` function with parameter whitelisting
   - **Impact**: Prevented arbitrary command execution on the system

2. **sed Injection in Token Removal (CVE-LEVEL: CRITICAL)**
   - **Location**: `scripts/cgi-bin/quecmanager/auth-token.sh:33`
   - **Issue**: Unescaped token variable in sed command allowing pattern injection
   - **Fix**: Added token format validation and switched to grep-based filtering instead of sed
   - **Impact**: Prevented potential file manipulation and information disclosure

3. **Weak Password Validation (CVE-LEVEL: MEDIUM-HIGH)**
   - **Location**: `scripts/cgi-bin/quecmanager/auth.sh:27-29`
   - **Issue**: Insufficient input validation, only blocking `&` and `$` characters
   - **Fix**: Implemented comprehensive `validate_password()` function blocking shell metacharacters
   - **Impact**: Reduced risk of command injection through password fields

### Security Enhancements Implemented

#### 1. Input Validation Library (`lib/secure-input.sh`)

A centralized security library providing:

- **Safe Query String Parsing**: `parse_query_string()` with parameter whitelisting
- **AT Command Validation**: `validate_at_command()` and `normalize_at_command_safe()`
- **Token Validation**: `validate_token()` ensuring proper format (32 hex characters)
- **Numeric Validation**: `validate_numeric()` with range checking
- **Password Validation**: `validate_password()` rejecting dangerous characters
- **sed/regex Escaping**: `escape_sed()` and `escape_regex()` for safe pattern usage
- **Rate Limiting**: `check_rate_limit()` for brute force protection
- **Path Validation**: `validate_file_path()` preventing directory traversal

#### 2. AT Command Whitelist (`constants/at-command-whitelist.ts`)

Implemented a comprehensive whitelist of safe AT commands:

- **Query Commands**: Read-only operations (IMEI, signal quality, network status)
- **Configuration Commands**: Require user confirmation
- **Restricted Commands**: Dangerous operations (reboot, power down) require explicit confirmation
- **Forbidden Commands**: Completely blocked (emergency download mode, shell access)

**Categories**:
- `query`: Safe read-only commands
- `config`: Configuration changes (confirmation required)
- `network`: Network operations (confirmation required)
- `diagnostic`: Diagnostic commands
- `restricted`: Potentially dangerous (confirmation required)

#### 3. Rate Limiting

Implemented rate limiting on critical endpoints:

- **Login endpoint** (`auth.sh`): 5 attempts per 60 seconds per IP
- Prevents brute force attacks
- Uses filesystem-based tracking in `/tmp/quecmanager/rate_limit/`

#### 4. Security Headers

Added comprehensive security headers in `next.config.mjs`:

```javascript
{
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; ..."
}
```

#### 5. Enhanced Authentication

- **Token Format Validation**: All tokens must be exactly 32 hex characters
- **Secure Token Generation**: Using `/dev/urandom` with 128 bits of entropy
- **Token Cleanup**: Automatic removal of tokens older than 2 hours
- **File Permissions**: Auth files restricted to 600 permissions
- **Directory Permissions**: Auth directory restricted to 700 permissions

## Security Architecture

### Authentication Flow

1. User submits credentials via POST to `/cgi-bin/quecmanager/auth.sh`
2. Rate limiting check performed (5 attempts/60s per IP)
3. Password validation (character whitelist, length check)
4. Password hashed using OpenSSL MD5 with salt (matches `/etc/shadow`)
5. On success, secure token generated and stored in `/tmp/quecmanager/auth_success`
6. Token sent to client and stored in localStorage
7. Subsequent requests include token in `Authorization` header
8. Token validated via `auth-token.sh` on each request

### Command Execution Flow

1. Frontend sends AT command request
2. **Whitelist Validation**: Command validated against approved patterns
3. **Confirmation Check**: Dangerous commands require user confirmation
4. Request proxied to CGI script with authentication token
5. **Token Validation**: Server validates token before execution
6. **Input Sanitization**: Command normalized and validated again
7. Command queued using atomic token system
8. Execution via `sms_tool` with timeout
9. Response returned to frontend with proper JSON escaping

### Data Collection Flow

1. React hooks initiate data fetch with authentication token
2. Request timeout set (AbortSignal.timeout)
3. Server validates token via `auth-token.sh`
4. **Query String Parsing**: Safe parsing with parameter whitelist
5. Predefined command sets executed (no user input in commands)
6. Results returned as JSON with proper escaping
7. Frontend handles errors with retry logic

## Remaining Security Considerations

### Known Limitations

1. **localStorage Token Storage**
   - Tokens stored in localStorage (vulnerable to XSS)
   - **Mitigation**: CSP headers, input validation, no eval() in frontend
   - **Recommendation**: Consider moving to HttpOnly cookies if architecture allows

2. **Session Duration**
   - 30-minute inactivity timeout with auto-extension
   - **Mitigation**: Session cleanup on inactivity
   - **Recommendation**: Reduce to 15 minutes for production

3. **Password Hashing Algorithm**
   - MD5 used for compatibility with `/etc/shadow`
   - **Limitation**: MD5 is cryptographically weak
   - **Constraint**: OpenWRT system limitation
   - **Mitigation**: Rate limiting, strong password requirements

4. **AT Command Terminal**
   - Still allows powerful commands (with whitelist)
   - **Mitigation**: Command whitelist, confirmation dialogs, audit logging
   - **Recommendation**: Log all commands with timestamps

5. **CGI Script Permissions**
   - Scripts run with elevated privileges
   - **Mitigation**: Input validation, parameter whitelisting
   - **Recommendation**: Regular security audits

## Best Practices for Developers

### Shell Script Development

1. **Never use eval()** with user input or query strings
2. **Always use parameter whitelisting** when parsing input
3. **Escape all variables** used in sed, grep, or other commands
4. **Validate numeric inputs** before using in calculations
5. **Use grep -F** for literal string matching (safer than regex)
6. **Set proper file permissions** (600 for sensitive files, 700 for directories)
7. **Use mktemp securely** with proper cleanup
8. **Quote all variables** in shell commands
9. **Use centralized logging** for audit trails
10. **Implement timeouts** for all external commands

### TypeScript/React Development

1. **Validate all user input** on the frontend (defense in depth)
2. **Use TypeScript strict mode** for type safety
3. **Implement timeout for all fetch requests**
4. **Handle errors gracefully** with user feedback
5. **Never store sensitive data** in localStorage if avoidable
6. **Sanitize data before display** (React does this automatically for JSX)
7. **Use CSP-compliant code** (avoid inline scripts)
8. **Implement rate limiting** on repeated actions
9. **Log security-relevant events** to console
10. **Use HTTPS** in production

### AT Command Development

1. **Always validate against whitelist** before execution
2. **Require confirmation** for dangerous commands
3. **Set appropriate timeouts** (longer for QSCAN, shorter for queries)
4. **Log command execution** for audit purposes
5. **Implement retry logic** with exponential backoff
6. **Handle modem errors gracefully**
7. **Never allow shell metacharacters** in commands
8. **Test commands** on non-production modems first

## Security Checklist for New Features

- [ ] Input validation implemented (frontend and backend)
- [ ] Authentication required for all sensitive endpoints
- [ ] Rate limiting considered for repeated actions
- [ ] Error messages don't leak sensitive information
- [ ] No eval() or similar dangerous functions used
- [ ] All user input sanitized/escaped before use
- [ ] File permissions properly set (600/700 for sensitive files)
- [ ] Timeout implemented for external commands
- [ ] Logging added for security-relevant events
- [ ] TypeScript types properly defined
- [ ] Error handling with graceful degradation
- [ ] Security headers appropriate for feature
- [ ] No hardcoded credentials or secrets
- [ ] CSRF protection if accepting state-changing requests

## Vulnerability Reporting

If you discover a security vulnerability in QuecManager-JS:

1. **Do NOT** open a public GitHub issue
2. Email the maintainers with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)
3. Allow reasonable time for fix before public disclosure
4. Credit will be given for responsible disclosure

## Security Audit Log

| Date | Auditor | Findings | Status |
|------|---------|----------|--------|
| 2025-11-06 | Claude AI | Critical eval() injection, sed injection, weak password validation | Fixed |
| 2025-11-06 | Claude AI | Implemented input validation library, AT command whitelist, rate limiting | Implemented |
| 2025-11-06 | Claude AI | Added security headers, improved authentication | Implemented |

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [CWE-78: OS Command Injection](https://cwe.mitre.org/data/definitions/78.html)
- [CWE-94: Code Injection](https://cwe.mitre.org/data/definitions/94.html)
- [Next.js Security Best Practices](https://nextjs.org/docs/app/building-your-application/configuring/security-headers)
- [OpenWRT Security Guidelines](https://openwrt.org/docs/guide-user/security/security)

## Conclusion

The security improvements implemented in November 2025 addressed critical command injection vulnerabilities and significantly improved the overall security posture of QuecManager-JS. However, security is an ongoing process. Regular audits, updates, and adherence to best practices are essential for maintaining a secure application.

**Last Updated**: 2025-11-06
**Version**: 2.0.0-security-hardened
