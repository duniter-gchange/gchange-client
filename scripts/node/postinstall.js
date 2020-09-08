#!/usr/bin/env node

const fs = require('fs'),
path = require('path');

// Remove not used file (from old cordova-uglify plugin)
try {
  fs.unlinkSync('hooks/uglify-config.json');
} catch (e) {
  // Silent
}


// Replace /www/lib with a symbolic link to bower component libs
try {
  fs.unlinkSync('www/lib');
}
catch(e ) {
  // Silent
}

try {
  fs.symlinkSync(path.resolve('node_modules/@bower_components'), 'www/lib', 'junction');
} catch (e) {
  throw new Error(e);
}

// Copy vendor libs
try {
  fs.copyFileSync('node_modules/d3/dist/d3.min.js', 'www/js/vendor/d3.min.js');
  fs.copyFileSync('node_modules/d3/dist/d3.js', 'www/js/vendor/d3.js');

  fs.copyFileSync('node_modules/d3-scale/dist/d3-scale.min.js', 'www/js/vendor/d3-scale.min.js');
  fs.copyFileSync('node_modules/d3-scale/dist/d3-scale.js', 'www/js/vendor/d3-scale.js');

  fs.copyFileSync('node_modules/d3-interpolate/dist/d3-interpolate.js', 'www/js/vendor/d3-interpolate.js');
  fs.copyFileSync('node_modules/d3-interpolate/dist/d3-interpolate.min.js', 'www/js/vendor/d3-interpolate.min.js');

  fs.copyFileSync('node_modules/d3-transform/build/d3-transform.min.js', 'www/js/vendor/d3-transform.min.js');
  fs.copyFileSync('node_modules/d3-transform/build/d3-transform.js', 'www/js/vendor/d3-transform.js');

  fs.copyFileSync('node_modules/d3-geo/dist/d3-geo.min.js', 'www/js/vendor/d3-geo.min.js');
  fs.copyFileSync('node_modules/d3-geo/dist/d3-geo.js', 'www/js/vendor/d3-geo.js');
} catch (e) {
  throw new Error(e);
}


// Remove some symbolic links, from the www/lib.
// This is a workaround, because Cordova copy failed on this file
try {
  fs.unlinkSync('www/lib/ionic-material/node_modules/.bin/gulp');
}
catch(e) {
  // Silent
}
try {
  fs.unlinkSync('www/lib/moment/meteor/moment.js');
} catch (e) {
  // Silent
}
// Remove some symbolic links, from the www/lib.
// This is a workaround, because Cordova copy failed on this file
try {
  fs.unlinkSync('www/lib/converse/node_modules/.bin/npm');
  fs.unlinkSync('www/lib/converse/node_modules/.bin/npx');
}
catch(e) {
  // Silent
}
