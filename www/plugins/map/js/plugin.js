
angular.module('cesium.map.plugin', [
    'ui-leaflet',
    // Services
    'cesium.map.services',
    // Controllers
    'cesium.map.user.controllers'
  ])

  // Configure plugin
  .config(function() {
    'ngInject';

    // Define icon prefix for AwesomeMarker (a Leaflet plugin)
    L.AwesomeMarkers.Icon.prototype.options.prefix = 'ion';

      console.warn('MAP plugin !!!' );
  });


