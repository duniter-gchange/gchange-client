angular.module('cesium.map.home.controllers', ['ngResource', 'cesium.es.services', 'cesium.map.shape.controllers'])

  // Configure menu items
  .config(function(PluginServiceProvider) {
    'ngInject';

    // Home extension points
    PluginServiceProvider.extendState('app.home', {
      points: {
        'footer-end': {
          templateUrl: "plugins/map/templates/shape/view_shape.html",
          controller: "MapHomeCtrl"
        }
      }
    });
  })

  .controller('MapHomeCtrl', MapHomeController)

;

function MapHomeController($scope, $rootScope, $controller, $state, csPlatform, UIUtils, esShape) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('MapShapeViewCtrl', {$scope: $scope}));

  $scope.onClick = function(event, element) {
    if (event && event.defaultPrevented) return;

    console.debug('[map] [home] Handling click on a SVG element...');

    // Update the leaflet map
    var features = d3.select(element).data();

    if (!features || !features.length) {
      console.error('[map] [home] Invalid SVG element: no geoJson data found.');
      return;
    }

    var feature = features[0];
    var properties = feature.properties;
    var location = properties.title && properties.title.trim();

    if (!location || !location.length) {
      console.error("[map] [home] Invalid GeoJson data. Missing or empty attribute 'properties.title'.");
      return;
    }

    // Store shape into root scope, to be able to read it again later (see MarketSearchController)
    return esShape.cache.put(feature)
      .then(function(id) {
        // Redirect to market search
        return $state.go('app.market_lookup', { shape: id, location: location });
      });
  };

  $scope.start = function() {

    console.debug('[home] [shape] Starting');

    // Start loading the map, if NOT small device
    $scope.load();
  };

  // Run start
  csPlatform.ready().then($scope.start);

}


