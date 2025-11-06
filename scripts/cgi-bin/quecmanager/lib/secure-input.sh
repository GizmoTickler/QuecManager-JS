#!/bin/sh
# Secure Input Handling Library
# Provides safe parsing and validation functions to prevent injection attacks
# Version: 1.0.0

# Parse query string parameters safely without eval()
# Usage: parse_query_string "$QUERY_STRING" "param1 param2 param3"
# Sets variables: QS_param1, QS_param2, QS_param3
parse_query_string() {
    local query_string="$1"
    local expected_params="$2"

    # Clear any existing QS_ variables
    for param in $expected_params; do
        eval "QS_${param}=''"
    done

    # Split by & and process each parameter
    local IFS='&'
    for pair in $query_string; do
        # Split by = (only first occurrence)
        local key="${pair%%=*}"
        local value="${pair#*=}"

        # Only set if key is in expected params (whitelist)
        for param in $expected_params; do
            if [ "$key" = "$param" ]; then
                # URL decode and sanitize
                value=$(url_decode "$value")
                # Store in QS_ prefixed variable
                eval "QS_${param}=\$value"
                break
            fi
        done
    done
}

# URL decode function (safe implementation)
url_decode() {
    local encoded="$1"
    # Replace + with space
    local decoded="${encoded//+/ }"
    # Decode percent-encoded sequences
    decoded=$(printf '%b' "${decoded//%/\\x}" 2>/dev/null || echo "$encoded")
    printf '%s' "$decoded"
}

# Validate AT command format
# Returns 0 if valid, 1 if invalid
validate_at_command() {
    local cmd="$1"

    # Must start with AT (case insensitive)
    if ! echo "$cmd" | grep -qi "^AT"; then
        return 1
    fi

    # Must not contain shell metacharacters that could cause injection
    # Allow: alphanumeric, spaces, +, =, ?, :, comma, semicolon (for AT commands), quotes, *, #
    if echo "$cmd" | grep -qE '[`$\\|&><(){}]'; then
        return 1
    fi

    # Check length (max 256 chars for AT commands)
    if [ ${#cmd} -gt 256 ]; then
        return 1
    fi

    return 0
}

# Validate and normalize AT command
# Returns normalized command on success, empty string on failure
normalize_at_command_safe() {
    local cmd="$1"

    # URL decode
    cmd=$(url_decode "$cmd")

    # Remove carriage returns and newlines
    cmd=$(echo "$cmd" | tr -d '\r\n')

    # Trim whitespace
    cmd=$(echo "$cmd" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    # Validate
    if ! validate_at_command "$cmd"; then
        return 1
    fi

    printf '%s' "$cmd"
    return 0
}

# Escape string for use in sed patterns
# Escapes: / \ & and newlines
escape_sed() {
    local string="$1"
    # Escape backslashes first
    string=$(printf '%s' "$string" | sed 's/[\/&\\]/\\&/g')
    printf '%s' "$string"
}

# Escape string for use in regex patterns
escape_regex() {
    local string="$1"
    # Escape regex metacharacters
    printf '%s' "$string" | sed 's/[.^$*+?()[{\\|]/\\&/g'
}

# Validate token format (must be 32 hex characters)
validate_token() {
    local token="$1"

    # Must be exactly 32 hex characters
    if echo "$token" | grep -qE '^[0-9a-fA-F]{32}$'; then
        return 0
    fi

    return 1
}

# Validate numeric parameter
# Usage: validate_numeric "value" "min" "max"
validate_numeric() {
    local value="$1"
    local min="$2"
    local max="$3"

    # Must be numeric
    if ! echo "$value" | grep -qE '^[0-9]+$'; then
        return 1
    fi

    # Check range if specified
    if [ -n "$min" ] && [ "$value" -lt "$min" ]; then
        return 1
    fi

    if [ -n "$max" ] && [ "$value" -gt "$max" ]; then
        return 1
    fi

    return 0
}

# Sanitize string for logging (remove control characters)
sanitize_for_log() {
    local string="$1"
    # Remove control characters except newlines and tabs
    printf '%s' "$string" | tr -d '\000-\010\013-\037\177'
}

# Validate password format (for auth.sh)
# Returns 0 if valid, 1 if invalid
validate_password() {
    local password="$1"

    # Check length (min 1, max 128)
    local len=${#password}
    if [ "$len" -lt 1 ] || [ "$len" -gt 128 ]; then
        return 1
    fi

    # Reject shell metacharacters that could cause issues
    # Allow most printable ASCII including spaces and special chars needed for strong passwords
    # Reject: backtick, $, &, |, ;, <, >, (, ), {, }, \, newline, carriage return
    if echo "$password" | grep -qE '[$`&|;<>(){}\\]'; then
        return 1
    fi

    return 0
}

# Generate secure random token (32 hex characters)
generate_secure_token() {
    # Use 16 bytes (128 bits) of entropy from /dev/urandom
    # Convert to 32 hex characters
    head -c 16 /dev/urandom | hexdump -v -e '/1 "%02x"'
}

# Safe grep with pattern escaping
# Usage: safe_grep "pattern" "file"
safe_grep() {
    local pattern="$1"
    local file="$2"

    # Escape the pattern for literal matching
    local escaped_pattern=$(escape_regex "$pattern")

    grep -F "$pattern" "$file" 2>/dev/null
}

# Validate file path (prevent directory traversal)
validate_file_path() {
    local path="$1"
    local allowed_prefix="$2"

    # Must not contain ..
    if echo "$path" | grep -q '\.\.'; then
        return 1
    fi

    # Must start with allowed prefix if specified
    if [ -n "$allowed_prefix" ]; then
        case "$path" in
            "$allowed_prefix"*)
                return 0
                ;;
            *)
                return 1
                ;;
        esac
    fi

    return 0
}

# Enhanced JSON escaping (for compatibility with existing code)
escape_json() {
    printf '%s' "$1" | awk '
    BEGIN { RS="\n"; ORS="\\n" }
    {
        gsub(/\\/, "\\\\")
        gsub(/"/, "\\\"")
        gsub(/\r/, "")
        gsub(/\t/, "\\t")
        gsub(/\f/, "\\f")
        gsub(/\b/, "\\b")
        print
    }
    ' | sed 's/\\n$//'
}

# Rate limiting check
# Usage: check_rate_limit "identifier" "max_requests" "time_window_seconds"
# Returns 0 if allowed, 1 if rate limit exceeded
check_rate_limit() {
    local identifier="$1"
    local max_requests="$2"
    local time_window="$3"
    local rate_limit_dir="/tmp/quecmanager/rate_limit"

    mkdir -p "$rate_limit_dir" 2>/dev/null
    chmod 700 "$rate_limit_dir" 2>/dev/null

    # Sanitize identifier for use as filename
    local safe_id=$(echo "$identifier" | tr -cd '[:alnum:]._-')
    local rate_file="$rate_limit_dir/${safe_id}"
    local current_time=$(date +%s)

    # Clean up old entries
    if [ -f "$rate_file" ]; then
        local tmp_file=$(mktemp)
        while read -r timestamp; do
            if [ -n "$timestamp" ] && [ $((current_time - timestamp)) -le "$time_window" ]; then
                echo "$timestamp" >> "$tmp_file"
            fi
        done < "$rate_file"
        mv "$tmp_file" "$rate_file"
    fi

    # Count requests in time window
    local request_count=0
    if [ -f "$rate_file" ]; then
        request_count=$(wc -l < "$rate_file")
    fi

    # Check if limit exceeded
    if [ "$request_count" -ge "$max_requests" ]; then
        return 1
    fi

    # Add current request
    echo "$current_time" >> "$rate_file"
    chmod 600 "$rate_file" 2>/dev/null

    return 0
}

# Export functions (not all shells support this, but helps with debugging)
# In scripts using this library, source it with: . /path/to/secure-input.sh
