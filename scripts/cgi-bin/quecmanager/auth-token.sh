#!/bin/sh

# Exit Codes: 0 = Success, 1 = Not Authorized, 2 = Auth File Not Found, 3 = Token Removal Failed

EXIT_CODE=0
AUTH_FILE="/tmp/quecmanager/auth_success"

# Load secure input handling library
SCRIPT_DIR="$(dirname "$0")"
. "${SCRIPT_DIR}/lib/secure-input.sh" 2>/dev/null || {
    # Fallback functions if library not found
    escape_sed() {
        printf '%s' "$1" | sed 's/[\/&\\]/\\&/g'
    }
    validate_token() {
        echo "$1" | grep -qE '^[0-9a-fA-F]{32}$'
    }
    generate_secure_token() {
        head -c 16 /dev/urandom | hexdump -v -e '/1 "%02x"'
    }
}

cleanup() {
    MAX_AGE=$((2 * 3600)) # 2 hours in seconds
    NOW_TIME=$(date +%s)
    TMP_FILE=$(mktemp)
    # AUTH_FILE cleanup process, Remove any token lines older than 2 hours from AUTH_FILE
    if [ -f $AUTH_FILE ]; then
        while read -r line; do
            if [ -n "$(echo "$line" | tr -d '[:space:]')" ]; then
                # Extract the date from the line and convert it to a timestamp
                TOKEN_DATE=$(echo "$line" | awk '{print $1}' | sed 's/T/ /')
                TOKEN_TIME=$(date -d "$TOKEN_DATE" +%s 2>/dev/null)
                # If date is valid and not older than MAX_AGE, keep the line
                if [ -n "$TOKEN_TIME" ] && [ $((NOW_TIME - TOKEN_TIME)) -le $MAX_AGE ]; then
                    echo "$line" >> "$TMP_FILE"
                fi
            fi
        done < "$AUTH_FILE"
        mv "$TMP_FILE" "$AUTH_FILE"
    fi
}

removeToken() {
    TOKEN=$1

    # SECURITY FIX: Validate token format before use
    if [ -z "${TOKEN}" ] || ! validate_token "${TOKEN}"; then
        echo '{"state":"failed", "message":"Invalid token format"}'
        EXIT_CODE=3
        return
    fi

    # Remove token from file with proper escaping
    if [ -f $AUTH_FILE ]; then
        # SECURITY: Escape token for safe use in sed pattern
        ESCAPED_TOKEN=$(escape_sed "${TOKEN}")

        # Create temporary file for safe manipulation
        TMP_FILE=$(mktemp)
        if [ -z "$TMP_FILE" ]; then
            echo '{"state":"failed", "message":"Token Removal Failed"}'
            EXIT_CODE=3
            return
        fi

        # Filter out lines containing the token
        grep -v "${TOKEN}" ${AUTH_FILE} > "$TMP_FILE" 2>/dev/null
        mv "$TMP_FILE" ${AUTH_FILE}
        chmod 600 ${AUTH_FILE} 2>/dev/null

        echo '{"state":"success", "message":"Logged out successfully"}'
        EXIT_CODE=0
    else
        echo '{"state":"failed", "message":"Token Removal Failed"}'
        EXIT_CODE=3
    fi
}
process() {
    if [ -n "$1" ]; then
        TOKEN=$1
        # Validate provided token
        if ! validate_token "${TOKEN}"; then
            echo "{\"response\": { \"status\": \"error\", \"raw_output\": \"Invalid Token Format\" }, \"error\":\"Invalid Token Format\"}"
            EXIT_CODE=1
            return
        fi
    else
        # SECURITY: Generate cryptographically secure token
        TOKEN=$(generate_secure_token)

        # Ensure auth directory exists with proper permissions
        AUTH_DIR=$(dirname "${AUTH_FILE}")
        mkdir -p "${AUTH_DIR}" 2>/dev/null
        chmod 700 "${AUTH_DIR}" 2>/dev/null

        touch ${AUTH_FILE}
        chmod 600 ${AUTH_FILE} 2>/dev/null

        echo "$(date +"%Y-%m-%dT%H:%M:%S") ${TOKEN}" >> ${AUTH_FILE}
        echo "" >> ${AUTH_FILE}
    fi

    if [ ! -f $AUTH_FILE ]; then
        echo '{"state":"failed", "message":"Authentication file not found"}'
        EXIT_CODE=2
        return
    fi

    # Use grep -F for literal string matching (safer)
    if [ $EXIT_CODE -eq 0 ] && ( [ -z "$TOKEN" ] || [ "$TOKEN" = "" ] || ! grep -qF "${TOKEN}" "${AUTH_FILE}" ); then
        echo "{\"response\": { \"status\": \"error\", \"raw_output\": \"Not Authorized\" }, \"command\": {\"timestamp\": \"$(date +%Y%m%d'T'%H%M%S)\"}, \"error\":\"Not Authorized\"}"
        EXIT_CODE=1
        return
    fi

    if [ $EXIT_CODE -eq 0 ] && grep -qF "$TOKEN" "$AUTH_FILE"; then
        echo "{\"state\":\"success\", \"token\":\"$TOKEN\"}"
        EXIT_CODE=0
    fi

}
case $1 in
    removeToken)
        removeToken $2
        ;;
    cleanup)
        cleanup
        ;;
    process)
        cleanup
        process $2
        ;;
    *)
        cleanup
        process $1
        ;;
esac

exit $EXIT_CODE