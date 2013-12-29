#!/bin/bash

PEERS_DIR=$1

function fail () {
    echo "$@"
    exit 1
}

if [ $# -ne 1 ]; then
    echo "usage: $(basename $0) /path/to/peers"
    exit 1
fi

cd $PEERS_DIR || fail "Could not cd to $PEERS_DIR"

for file in *; do
    if [ -f $file ]; then
        host=$(grep "^# Knotenname:" -- "$file" | cut -d ' ' -f 3 | tr '[:upper:]' '[:lower:]')
        mac=$(
            grep "^# MAC:" -- "$file" \
                | cut -d ' ' -f 3 \
                | sed -e 's/^\([0-9a-fA-F]\{2\}\):\?\([0-9a-fA-F]\{2\}\):\?\([0-9a-fA-F]\{2\}\):\?\([0-9a-fA-F]\{2\}\):\?\([0-9a-fA-F]\{2\}\):\?\([0-9a-fA-F]\{2\}\)$/\1:\2:\3:\4:\5:\6/' \
                | tr '[:upper:]' '[:lower:]'
        )
        key=$(grep "^key " -- "$file" | cut -d '"' -f 2 | tr '[:upper:]' '[:lower:]')
        token=$(grep "^# Token:" -- "$file" | cut -d ' ' -f 3 | tr '[:upper:]' '[:lower:]')
        mv -- "$file" "$host@$mac@$key@$token"
    fi
done

