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
        host=$(grep "^# Knotenname:" $file | cut -d ' ' -f 3)
        mac=$(grep "^# MAC:" $file | cut -d ' ' -f 3)
        key=$(grep "^key " $file | cut -d '"' -f 2)
        mv $file "$host@$mac@$key"
    fi
done

