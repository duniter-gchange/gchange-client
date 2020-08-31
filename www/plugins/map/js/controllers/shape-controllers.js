var d3Transform;

angular.module('cesium.map.shape.controllers', ['cesium.services', 'cesium.map.shape.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.map_shape_edit', {
        url: "/map/shape/edit",
        views: {
          'menuContent': {
            templateUrl: "plugins/map/templates/shape/edit_shape.html",
            controller: 'MapShapeEditCtrl'
          }
        }
      })
  })

  .controller('MapShapeViewCtrl', MapShapeViewController)

  .controller('MapShapeEditCtrl', MapShapeEditController);


function MapShapeViewController($scope, $translate, $timeout, $q, $document,
                                  UIUtils, csConfig, csSettings, esShape) {
  'ngInject';


  $scope.loading = true;
  $scope.shapeId = 'shape-' + $scope.$id;
  $scope.formData = {
    country: null
  }
  $scope.countriesMap = {
    fr: 'France',
    be: 'Belgium',
    es: 'Spain',
    gb: 'United Kingdom',
    us: 'USA'
  };
  $scope.countries = $scope.countries || Object.keys($scope.countriesMap);

  $scope.getDefaultCountry = function(options) {
    var defaultCountry = options && options.country;

    // Try to get from locale
    if (!defaultCountry) {
      var locale = csSettings.data.locale || {id: $translate.use()};
      var localCountry = locale && locale.country || locale.id.split('-')[1];

      defaultCountry = localCountry && _.find($scope.countries, function (c) {
        return c.toUpperCase() === localCountry.toUpperCase();
      });
    }
    if (!defaultCountry && csConfig.plugins && csConfig.plugins.es && csConfig.plugins.es.defaultCountry) {
      defaultCountry = _.find($scope.countries, function (c) {
        var title = $scope.countriesMap[c];
        return title && title.toUpperCase() === csConfig.plugins.es.defaultCountry.toUpperCase() ? c : false;
      }) || 'fr'; // Default country
    }

    return defaultCountry  || 'fr';
  }

  $scope.load = function(options) {
    options = options || {};
    options.silent = angular.isDefined(options.silent) ? options.silent : false;
    if (options.silent) $scope.loading = true;

    console.debug('[shape] Loading country map...');

    $scope.formData = $scope.formData || {};
    $scope.formData.country = $scope.getDefaultCountry(options);

    return esShape.get({country: $scope.formData.country})
      .then(function(geoJson) {
        console.debug('[map] [shape] Plotting geoJson as SVG');

        if (geoJson) {
          esShape.svg.create(geoJson, {
            selector: '#' + $scope.shapeId,
            onclick: $scope.onClick
          });
        }
        else {
          esShape.svg.remove({selector: '#' + $scope.shapeId});
        }

        //document.getElementById('demolink').href = "http://geojson.io/#data=data:application/json," + encodeURIComponent(JSON.stringify(geoJson));

        // Add listeners
        $scope.addListeners();

        $scope.loading = false;
      })
      .catch(function(err) {
        console.error("Cannot load shape for country '{0}'".format($scope.formData.country), err);
        $scope.loading = false;
      })
  }

  $scope.onCountryChange = function(country) {
    if (!country) return; // Skip
    console.debug('[shape] Select country map:', country);
    return $scope.load({country: country});
  }

  // Watch locale change, to reload categories
  $scope.onLocaleChange = function(localeId) {
    console.debug('[market] [map] Reloading map, because locale changed to ' + localeId);
    var locale = _.findWhere(csSettings.locales, {id: localeId}) || {id : $translate.use()};
    var country = locale && (locale.country || locale.id.split('-')[1]);
    return $scope.onCountryChange(country);
  };


  $scope.addListeners = function() {
    if ($scope.listeners) return; // skip

    $scope.listeners = [
      csSettings.api.locale.on.changed($scope, $scope.onLocaleChange, this)
    ]
  }

  $scope.onClick = function(event, element) {
    if (event && event.defaultPrevented) return;

    console.debug('[shape] Handle click event, on a SVG element', element);


    if (geoJson) {
      //console.log(geoJson);
      document.getElementById('demolink').href = "http://geojson.io/#data=data:application/json," + encodeURIComponent(JSON.stringify(geoJson));
    }
  };
}




















function MapShapeEditController($scope, $rootScope, $state, $controller, $timeout, $q, leafletData, $translate,
                                UIUtils, MapUtils, csWallet, esShape) {
  'ngInject';

  $scope.entered = false;
  $scope.saving = false;
  $scope.formData = {
    leftLng: null,
    topLat: null,
    rightLng: null,
    bottomLat: null
  };
  $scope.dirty = false;
  $scope.selectedElement = null;
  $scope.countries = [];
  $scope.iso2Pattern = /^[a-z][a-z]$/;
  $scope.showLeaflet = false;

  // Initialize the super class and extend it.
  angular.extend(this, $controller('MapShapeViewCtrl', {$scope: $scope}));

  $scope.mapId = 'map-' + $scope.$id;
  $scope.map = MapUtils.map({
    markers: {},
    center: {
      zoom: 4
    },
    defaults: {
      tileLayerOptions: {
        attribution: '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }
    }
  });
  $scope.layers = [];
  $scope.canSelectShape = true;

  $scope.enter = function (e, state) {
    if (!$scope.entered) {
      $scope.entered = true;

      $scope.load();
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.load = function(options) {
    options = options || {};

    // Reset the form
    $scope.formData = {};
    $scope.dirty = false;

    // Load countries
    return $q.all([
      $scope.loadAllCountries(),
      options.country ? esShape.get({country: options.country}) : $q.when()
    ])
      .then(function(res) {
        var geoJson = res[1];
        return $scope.updateView(geoJson, options);
      })
      .then(function() {
        $scope.loading = false;
      })
      .catch(function(err) {
        console.error(err);
        UIUtils.alert.error(err && err.message || err);
        $scope.loading = false;
      })
  }

  $scope.loadAllCountries = function() {
    return esShape.getAllCountries()
      .then(function (countries) {
        // Replace countries
        $scope.countries = _(countries || []).pluck('id');
      });
  };

  $scope.resetForm = function(data) {
    $scope.formData = data || {};

    $timeout(function() {
      $scope.updatingForm = false;
    }, 500);
  };

  $scope.markAsDirty = function() {
    $scope.dirty = true;
  }

  $scope.$watch('formData', $scope.markAsDirty, true);


  $scope.clearMapLayers = function(layers) {
    layers = layers || $scope.layers;
    if (!layers.length) return; // Nothing to clean

    return $scope.loadMap()
      .then(function(map) {

        // Remove each layers
        while(layers.length) {
          var layer = layers.splice(0,1)[0];
          map.removeLayer(layer);
        }
      });
  }

  $scope.loadMap = function() {
    if ($scope.leafletMap) return $q.when($scope.leafletMap);

    return leafletData.getMap($scope.mapId)
      .then(function(map) {
        $scope.leafletMap = map;
        return map;
      });
  }

  $scope.setForm = function(form) {
    $scope.form = form;
  };

  $scope.onFileChanged = function(event) {
    if (!event || !event.file) return; // Skip
    var geoJson = event.fileContent && JSON.parse(event.fileContent);
    $scope.updateView(geoJson);
  }

  $scope.updateView = function(geoJson, options) {
    if (!geoJson) {
      $scope.canSelectShape = true;
      return $q.when();
    }

    $scope.canSelectShape = false;

    esShape.svg.create(geoJson, {
      selector: '#svg-container',
      onclick: $scope.onPathClick
    });

    $scope.formData.country = options && options.country || '';

    return $scope.addGeoJsonToMap(geoJson);
  }


  $scope.onPathClick = function(event, element) {

    $scope.selectedElement = element;
    var path = d3.select(element);

    var geoJson = path.data()[0];

    var properties = $scope.getNormalizeProperties(geoJson && geoJson.properties || {});
    properties.country = $scope.formData.country;
    $scope.resetForm(properties);

    $scope.$apply();
  }

  $scope.deleteElement = function() {
    if (!$scope.selectedElement) return;

    var svg = d3.select($scope.selectedElement.parentNode);
    
    d3.select($scope.selectedElement).remove();

    // Update the leaflet map
    var geoJson = {
      type: 'FeatureCollection',
      features: svg.selectAll('path').data()
    };

    $scope.dirty = true;

    return $scope.addGeoJsonToMap(geoJson);

  }

  $scope.updateElement = function() {
    if (!$scope.selectedElement) return;

    var svgElement = d3.select($scope.selectedElement);
    var geoJson = svgElement.data();


    geoJson.properties = angular.merge(geoJson.properties || {}, $scope.formData);

    svgElement.data(geoJson);

    $scope.selectedElement = null;
    $scope.dirty = true;
  }

  $scope.addGeoJsonToMap = function(geoJson, options) {

    return $scope.loadMap()
      .then(function(map) {

        // Remove existing layers
        if (!options || options.replace !== false) {
          while($scope.layers.length) {
            var layer = $scope.layers.splice(0,1)[0];
            map.removeLayer(layer);
          }
        }

        var newlayer = L.geoJson(geoJson, {
          onEachFeature: function (feature, layer) {
            var properties = $scope.getNormalizeProperties(feature.properties);
            layer.bindPopup('<b>' + properties.name + '</b><br>'
              + 'code: ' + properties.id + '<br><br>');
          }
        }).addTo(map);
        newlayer.on('click', function(event){
          if (event && event.originalEvent && event.originalEvent.target) {
            console.log('[map] [shape-edit] TODO: find a way to get the features from SVG, not leaflet')
            $scope.onPathClick(event.originalEvent, event.originalEvent.target);
          }
        })
        $scope.layers.push(newlayer);
      });
  }



  $scope.cancel = function() {
    $scope.resetForm();
    $scope.selectedElement = null;
    $scope.selectedCountry = null;
    $scope.canSelectShape = true;

    d3.select('#svg-container svg').remove();
  }

  $scope.save = function() {
    $scope.form.$submitted=true;
    if($scope.saving || // avoid multiple save
      !$scope.form.$valid || !$scope.formData.country) {
      return $q.reject();
    }

    if (!csWallet.isLogin()) {
      return $scope.loadWallet().then($scope.save);
    }

    $scope.saving = true;
    console.debug('Saving shape to Pod...')


    var defaultCountry = $scope.formData.country || 'fr';

    var svg = d3.select('#svg-container svg');

    // Update the leaflet map
    var features = svg.selectAll('path').data();

    UIUtils.loading.show({template: 'Saving...'});

    var idsMap = {};
    return $q.all(_(features||[]).map(function(feature, index) {
      feature.type = feature.type && feature.type;

      // Normalize features properties
      feature.properties = $scope.getNormalizeProperties(feature.properties, {country: defaultCountry});

      var isNew = !features.properties || !angular.isDefined(features.properties.id) || idsMap[features.properties.id];

      if (isNew) {
        var id;
        while(!id || idsMap[id]) {
          id = defaultCountry + '-' + index++;
        }
        // Generate an id
        feature.properties.id = id;
        idsMap[id] = true;
      }
      else {
        idsMap[features.properties.id] = true;
      }
      console.debug("[map] [country] Saving ", feature.properties);

      return isNew ? esShape.add(feature) : esShape.update(feature, {id: feature.properties.id});
    }))
      .then(function() {
        $scope.saving = false;
        UIUtils.toast.show("MAP.SHAPE.EDIT.INFO.SAVED");

        // Reload countries
        $scope.loadAllCountries();
      })
      .catch(function(err) {
        $scope.saving = false;
        return UIUtils.onError("MAP.SHAPE.EDIT.ERROR.SAVE_FAILED")(err);
      });


  }

  $scope.getNormalizeProperties = function(properties, defaults) {
    return {
      country: properties && properties.country || (defaults && defaults.country),
      name: properties && (properties.name || properties.nom),
      id: properties && (properties.id || properties.code || (defaults && defaults.id))
    };
  }

  $scope.searchOnPath = function() {
    if (!$scope.selectedElement) return;

    // Update the leaflet map
    var features = d3.select($scope.selectedElement).data();

    if (!features || !features.length) return; // Skip

    var feature = features[0];
    var properties = $scope.getNormalizeProperties(feature.properties);
    var location = properties.name;
    console.log("TODO search", features);

    $rootScope.geoShapes = $rootScope.geoShapes || {};
    $rootScope.geoShapes[location] = feature.geometry;
    $state.go('app.market_lookup', {location: properties.name});
  }
}
