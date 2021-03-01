#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

# Preparing Android environment
. ${PROJECT_DIR}/scripts/env-android.sh
[[ $? -ne 0 ]] && exit 1

ANDROID_OUTPUT_APK_RELEASE=${PROJECT_DIR}/platforms/android/app/build/outputs/apk/release
APK_UNSIGNED_FILE=${ANDROID_OUTPUT_APK_RELEASE}/${ANDROID_OUTPUT_APK_PREFIX}-release-unsigned.apk
APK_SIGNED_FILE=${ANDROID_OUTPUT_APK_RELEASE}/${ANDROID_OUTPUT_APK_PREFIX}-release-signed.apk


# Remove existing APK
if [[ -d "${ANDROID_OUTPUT_APK_RELEASE}" ]]; then
  rm ${ANDROID_OUTPUT_APK_RELEASE}/*.apk
fi;

cd ${PROJECT_DIR}

# Run the build
echo "Running cordova build..."
ionic cordova build android --warning-mode=none --color --prod --release
[[ $? -ne 0 ]] && exit 1


# Sign the APK if possible
if [[ ! -f "${APK_SIGNED_FILE}" ]]; then
  . ${PROJECT_DIR}/scripts/release-android-sign.sh
  [[ $? -ne 0 ]] && exit 1
fi

# Check signed APK exists
if [[ ! -f "${APK_SIGNED_FILE}" ]]; then
  echo "No APK file generated!"
  exit 1
fi
