#!/usr/bin/env bash
# Set a new password for one account on the live server.
# Run from Git Bash on the PC:  bash deploy/reset-password.sh [username]
# The password is typed here (hidden), sent over SSH on stdin, hashed inside
# the running api container and stored. It never appears on a command line or in logs.
set -euo pipefail

U="${1:-owner}"
case "$U" in *[!a-z0-9._-]*|"") echo "Username may only use small letters, numbers, . _ -"; exit 1;; esac

read -rsp "New password for '$U' (8+ characters): " P1; echo
read -rsp "Type it again: " P2; echo
[ "$P1" = "$P2" ] || { echo "The two passwords don't match. Nothing changed."; exit 1; }
[ "${#P1}" -ge 8 ] || { echo "Too short (needs 8+). Nothing changed."; exit 1; }

# Runs on the server. stdin = the password (one line).
REMOTE='set -e; cd ~/projects/wholesale/deploy
H=$(docker compose exec -T api python -c "import sys; from app._shared.core.security import hash_password; print(hash_password(sys.stdin.readline().rstrip(chr(10))))")
case "$H" in \$2*) ;; *) echo "Could not make the password hash. Nothing changed."; exit 1;; esac
N=$(printf "%s\n" "UPDATE users SET password_hash = :'"'"'h'"'"' WHERE username = :'"'"'u'"'"';" \
  | docker compose exec -T db psql -U wholesale -d wholesale -At -v ON_ERROR_STOP=1 -v h="$H" -v u="'"$U"'")
echo "$N"'

printf '%s\n' "$P1" | ssh dfx-vps "$REMOTE"
unset P1 P2
echo "Done if it says UPDATE 1 above (UPDATE 0 = no such user). Sign in at https://wholesale.dfxgold.tech"
