#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

cd ${PROJECT_DIR}

### Control that the script is run on `dev` branch
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ ! "$branch" == "master" ]];
then
  echo ">> This script must be run under \`master\` branch"
  exit 1
fi

### Get current version (package.json)
current=$(grep -oP "version\": \"\d+.\d+.\d+((a|b)[0-9]+)?" package.json | grep -m 1 -oP "\d+.\d+.\d+((a|b)[0-9]+)?")
if [[ "_$current" == "_" ]]; then
  echo "Unable to read the current version in 'package.json'. Please check version format is: x.y.z (x and y should be an integer)."
  exit 1;
fi
echo "Current version: $current"

# Preparing environment
. ${PROJECT_DIR}/scripts/env-global.sh
if [[ $? -ne 0 ]]; then
  exit 1
fi

echo "----------------------------------"
echo "- Building desktop artifacts..."
echo "----------------------------------"
if [[ ! -d "${PROJECT_DIR}/dist/desktop" ]]; then
  cd ${PROJECT_DIR}
  git submodule init
fi
if [[ -d "${PROJECT_DIR}/dist/desktop" ]]; then
  cd "${PROJECT_DIR}/dist/desktop"

  # Fetch last updates
  git fetch origin && git merge origin/master || exit 1

  # Build desktop assets
  ./release.sh $current || exit 1
else
  echo "ERROR: dist/desktop not found -> Make sure git submodule has been init!"
  exit 1
fi;

echo "**********************************"
echo "* Build desktop succeed !"
echo "**********************************"

