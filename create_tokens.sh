#!/bin/bash

PEERS_DIR=$1

function fail () {
    echo "$@"
    exit 1
}

function genToken () {
    hexdump -x /dev/urandom | \
        head -n1 | \
        tr -s ' ' ' ' | \
        cut -d ' ' -f2-5 | \
        sed -e 's/ //g'
}

if [ $# -ne 1 ]; then
    echo "usage: $(basename $0) /path/to/peers"
    exit 1
fi

cd $PEERS_DIR || fail "Could not cd to $PEERS_DIR"

for file in *; do
    if [ -f $file ]; then
        mac=$(grep "^# MAC:" -- "$file" | cut -d ' ' -f 3)
        token=$(grep "^# Token:" -- "$file" | cut -d ' ' -f 3)
        if [ -z "$token" ] && [ ! -z "$mac" ]; then
            tmp=$(mktemp)
            (
                cat -- "$file"
                echo "# Token: $(genToken)"
            ) > $tmp
            mv -f -- "$tmp" "$file"
            chmod 644 "$file"
        fi
    fi
done

