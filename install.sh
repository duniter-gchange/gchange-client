#!/bin/bash

{ # this ensures the entire script is downloaded #

is_installed() {
  type "$1" > /dev/null 2>&1
}

if [ "_$1" != "_" ]; then
  GCHANGE_DIR="$1"
fi
if [ "_$GCHANGE_DIR" = "_" ]; then
  DIRNAME=`pwd`
  GCHANGE_DIR="$DIRNAME/gchange"
fi

latest_version() {
  echo "v0.4.2" #lastest
}

api_release_url() {
  echo "https://api.github.com/repos/duniter-change/duniter-client/releases/tags/$(latest_version)"
}

download() {
  if is_installed "curl"; then
    curl -qkL $*
  elif is_installed "wget"; then
    # Emulate curl with wget
    ARGS=$(echo "$*" | command sed -e 's/--progress-bar /--progress=bar /' \
                           -e 's/-L //' \
                           -e 's/-I /--server-response /' \
                           -e 's/-s /-q /' \
                           -e 's/-o /-O /' \
                           -e 's/-C - /-c /')
    wget $ARGS
  fi
}

install_from_github() {

  local RELEASE=`curl -XGET -i $(api_release_url)`
  local GCHANGE_URL=`echo "$RELEASE" | grep -P "\"browser_download_url\": \"[^\"]+" | grep -oP "https://[a-zA-Z0-9/.-]+-web.zip"`
  local GCHANGE_ARCHIVE=$GCHANGE_DIR/cesium.zip
  if [ -d "$GCHANGE_DIR" ]; then
    if [ -f "$GCHANGE_ARCHIVE" ]; then
      echo "WARNING: Deleting existing archive [$GCHANGE_ARCHIVE]"
      rm $GCHANGE_ARCHIVE
    fi
  else
    mkdir -p "$GCHANGE_DIR"
  fi

  echo "Downloading [$GCHANGE_URL]"
  download "$GCHANGE_URL" -o "$GCHANGE_ARCHIVE" || {
      echo >&2 "Failed to download '$GCHANGE_URL'"
      return 4
    }
  echo "Unarchive to $GCHANGE_DIR"
  unzip -o $GCHANGE_ARCHIVE -d $GCHANGE_DIR
  rm $GCHANGE_ARCHIVE

  echo

  echo "ğchange successfully installed at $GCHANGE_DIR"
}

do_install() {

  if ! is_installed "curl"; then
    echo "=> curl is not available. You will likely need to install 'curl' package."
    exit 1
  fi
  if ! is_installed "unzip"; then
    echo "=> unzip is not available. You will likely need to install 'unzip' package."
    exit 1
  fi

  install_from_github
}

#
# Unsets the various functions defined
# during the execution of the install script
#
reset() {
  unset -f reset is_installed latest_version \
    download install_from_github do_install
}

[ "_$GCHANGE_ENV" = "_testing" ] || do_install $1

} # this ensures the entire script is downloaded #
