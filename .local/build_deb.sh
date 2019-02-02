#!/bin/bash

cd platforms/desktop


VERSION=0.8.3

EXPECTED_ASSETS="cesium-desktop-v$VERSION-linux-x64.deb"
export EXPECTED_ASSETS

./release.sh $VERSION
if [[ $? -ne 0 ]]; then
    exit 2
fi
