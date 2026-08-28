#!/bin/sh
# This script is mounted into a Linux PostgreSQL container; retain LF endings.
set -eu

test_database="${KEYLORNET_POSTGRES_TEST_DB:?KEYLORNET_POSTGRES_TEST_DB is required}"

case "$test_database" in
  *_test) ;;
  *)
    echo "KEYLORNET_POSTGRES_TEST_DB must end in _test" >&2
    exit 1
    ;;
esac

escaped_database=$(printf '%s' "$test_database" | sed 's/"/""/g')
escaped_owner=$(printf '%s' "$POSTGRES_USER" | sed 's/"/""/g')

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
  --command "CREATE DATABASE \"$escaped_database\" OWNER \"$escaped_owner\";"
