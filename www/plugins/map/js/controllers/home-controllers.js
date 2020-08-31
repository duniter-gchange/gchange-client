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

function MapHomeController($scope, $rootScope, $controller, $state) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('MapShapeViewCtrl', {$scope: $scope}));

  // Start loading the map
  $scope.load();

  $scope.onClick = function(event, element) {
    if (event && event.defaultPrevented) return;

    console.debug('[map] [home] Handle click event, on a SVG element');

    // Update the leaflet map
    var features = d3.select(element).data();

    if (!features || !features.length) return; // Skip

    var feature = features[0];
    var properties = feature.properties;
    var location = properties.name;

    $rootScope.geoShapes = $rootScope.geoShapes || {};
    $rootScope.geoShapes[location] = feature.geometry;
    $state.go('app.market_lookup', {location: properties.name});
  };

}


