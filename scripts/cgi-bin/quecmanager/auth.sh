#!/bin/sh

# Set Content-Type for CGI script
echo "Content-type: application/json"
echo ""

# Read POST data
read -r POST_DATA

# Extract the password from POST data (URL encoded)
USER="root"
INPUT_PASSWORD=$(echo "$POST_DATA" | grep -o 'password=[^&]*' | cut -d= -f2-)
RESPONSE=""
HOST_DIR=$(pwd)

# Load secure input handling library
SCRIPT_DIR="$(dirname "$0")"
. "${SCRIPT_DIR}/lib/secure-input.sh" 2>/dev/null || {
    # Fallback URL decode function
    urldecode() {
        local encoded="${1//+/ }"
        printf '%b' "${encoded//%/\\x}"
    }
    # Fallback password validation
    validate_password() {
        local password="$1"
        local len=${#password}
        if [ "$len" -lt 1 ] || [ "$len" -gt 128 ]; then
            return 1
        fi
        if echo "$password" | grep -qE '[$`&|;<>(){}\\]'; then
            return 1
        fi
        return 0
    }
}

# Decode the password
INPUT_PASSWORD=$(urldecode "$INPUT_PASSWORD")

# SECURITY: Rate limiting for login attempts (5 attempts per 60 seconds per IP)
CLIENT_IP="${REMOTE_ADDR:-unknown}"
if ! check_rate_limit "auth_${CLIENT_IP}" 5 60 2>/dev/null; then
    echo '{"state":"failed", "message":"Too many login attempts. Please try again later."}'
    exit 1
fi

# SECURITY: Enhanced password validation
if ! validate_password "$INPUT_PASSWORD"; then
    echo '{"state":"failed", "message":"Invalid password format or contains forbidden characters"}'
    exit 1
fi

# Sanitize the password for shell usage (defense in depth)
INPUT_PASSWORD=$(printf '%s' "$INPUT_PASSWORD" | sed 's/[\"]/\\&/g')

# Extract the hashed password from /etc/shadow for the specified user
USER_SHADOW_ENTRY=$(grep "^$USER:" /etc/shadow)

if [ -z "$USER_SHADOW_ENTRY" ]; then
    echo '{"state":"failed", "message":"User not found"}'
    exit 1
fi

# Extract the password hash (it's the second field, colon-separated)
USER_HASH=$(echo "$USER_SHADOW_ENTRY" | cut -d: -f2)

# Extract the salt (MD5 uses the $1$ prefix followed by the salt)
SALT=$(echo "$USER_HASH" | cut -d'$' -f3)

# Generate a hash from the input password using the same salt
# Use printf to avoid issues with special characters in echo
GENERATED_HASH=$(printf '%s' "$INPUT_PASSWORD" | openssl passwd -1 -salt "$SALT" -stdin)

# Check if the request for AUTH contains the Authorization Header so as to assure we're not at an initial login
SUPPLIED_TOKEN="${HTTP_AUTHORIZATION}"
# Compare the generated hash with the one in the shadow file
if [ "$GENERATED_HASH" = "$USER_HASH" ]; then
    RESPONSE=$(/bin/sh ${HOST_DIR}/cgi-bin/quecmanager/auth-token.sh process "$SUPPLIED_TOKEN")
else
    RESPONSE=$(/bin/sh ${HOST_DIR}/cgi-bin/quecmanager/auth-token.sh removeToken "$SUPPLIED_TOKEN")
fi

echo "$RESPONSE"