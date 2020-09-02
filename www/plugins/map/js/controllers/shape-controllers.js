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
  $scope.countries;

  $scope.load = function(options) {
    options = options || {};

    // Make sure to load countries
    if (!$scope.countries) {
      return $scope.loadAllCountries()
        .then(function() {
          $scope.load(options); // Loop
        });
    }


    var country = $scope.getDefaultCountry(options);
    $scope.formData.country = country;

    var now;
    if (!options || options.silent !== true) {
      $scope.loading = true;
      now = Date.now();
      console.debug('[shape] Loading shape for country {{0}}...'.format(country));
    }

    return esShape.get({country: country})
      .then(function(data) {
        // Display data
        $scope.updateView(data);

        // Add listeners
        $scope.addListeners();

        if (now) {
          console.debug('[shape] Shape loaded in {0}ms'.format(Date.now() - now));
        }
        $scope.loading = false;
      })
      .catch(function(err) {
        console.error("Cannot load shape for country '{0}'".format(country), err);
        $scope.loading = false;
      })
  };

  $scope.loadAllCountries = function() {
    return esShape.getAllCountries()
      .then(function (countries) {
        // Replace countries
        $scope.countries = _(countries || []).pluck('id');
      });
  };

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

  $scope.updateView = function(geoJson) {
    if (!geoJson) {
      esShape.svg.remove({selector: '#' + $scope.shapeId});
    }
    else {
      esShape.svg.createMosaic(geoJson, {
        selector: '#' + $scope.shapeId,
        onclick: $scope.onClick
      });
    }
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
    country: null,
  };
  $scope.elementData = {
    country: null,
    id: null,
    name: null,
    position: 'main'
  };
  $scope.dirty = false;
  $scope.countries = [];
  $scope.iso2Pattern = /^[a-z][a-z]$/;
  $scope.positions = esShape.constants.positions;
  $scope.positionPattern = new RegExp('^(' + esShape.constants.positions.join('|') + ')$');
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
    },
    geojson: {
      data: null,
      style: {
        fillColor: esShape.constants.defaults.fill,
        fillOpacity: 0.7,
        color: esShape.constants.defaults.stroke,
        opacity: 1,
        weight: 1
      }
    }
  });

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
    $scope.dirty = false;

    if (!options.silent){
      $scope.loading = true;
      UIUtils.loading.show();
    }
    return $q.all([
      // Load shape
      options.country ? esShape.get({country: options.country}) : $q.when(),
      // Load countries
      $scope.loadAllCountries()
    ])
      .then(function(res) {
        var geoJson = res[0] || null;
        return $scope.updateView(geoJson, options);
      })
      .then(function() {
        $scope.loading = false;
        UIUtils.loading.hide();
      })
      .catch(function(err) {
        console.error(err);
        UIUtils.alert.error(err && err.message || err);
        $scope.loading = false;
      })
  }

  $scope.resetForms = function(data) {
    $scope.resetCountryForm(data);
    $scope.resetElementForm(data);
  };

  $scope.resetCountryForm = function(data) {
    angular.merge($scope.formData, {
      country: (data && data.country) || ($scope.formData && $scope.formData.country)
    });
  };

  $scope.resetElementForm = function(data) {
    var position = (data && data.position) || 'main';
    angular.merge($scope.elementData, {
      id: data && data.id || null,
      name: data && data.name || null,
      country: (data && data.country) || ($scope.formData && $scope.formData.country),
      position: position,
      order: (position !== 'main' && data.order) || undefined
    });
    $scope.elementData.element = data && data.element || null;
  };

  $scope.markAsDirty = function() {
    if ($scope.loading || $scope.saving) return; // Skip
    $scope.dirty = true;
  }
  $scope.$watch('formData.country', $scope.markAsDirty, true);

  $scope.setCountryForm = function(form) {
    $scope.countryForm = form;
  };
  $scope.setElementForm = function(form) {
    $scope.elementForm = form;
  };

  $scope.onFileChanged = function(event) {
    if (!event || !event.file || !event.fileContent) return; // Skip

    try {
      var geoJson;
      if (event.file.type.startsWith('image/svg')) {
        geoJson = esShape.svg.toGeoJson(event.fileContent, {
          selector: '#' + $scope.shapeId
        });
      }
      else {
        geoJson = event.fileContent && JSON.parse(event.fileContent);
      }

      if (geoJson) {
        $scope.resetForms();
        $scope.markAsDirty();

        $scope.updateView(geoJson);
      }
    }
     catch(err) {
      console.error(err);
      UIUtils.onError('MAP.SHAPE.EDIT.ERROR.INVALID_SVG')(err);
     }

  }

  $scope.updateView = function(geoJson, options) {
    var selector = '#' + $scope.shapeId;
    if (!geoJson) {
      esShape.svg.remove({selector: selector});
    }
    else {
      _($scope.positions).each(function(position) {
        d3.selectAll([selector, '.' + position, 'svg'].join(' ')).remove();
      })
      esShape.svg.createMosaic(geoJson, {
        selector: selector,
        onclick: $scope.onPathClick
      });
    }

    $scope.resetElementForm({country: options && options.country});
    $scope.map.geojson.data = geoJson;
    return $q.when();
  }

  $scope.onPathClick = function(event, element) {

    console.debug('[map] [shape] Start edit element:', element);
    var path = d3.select(element);

    var geoJson = path.data()[0] || {};

    var properties = $scope.getNormalizeProperties(geoJson.properties || {});
    $scope.resetElementForm(properties);
    $scope.elementData.element = element;

    $scope.$apply();
  }

  $scope.deleteElement = function() {
    if (!$scope.elementData.element) return;

    var svg = d3.select($scope.elementData.element.parentNode);
    var path = d3.select($scope.elementData.element);

    path.remove();

    // Update the leaflet map
    var geoJson = {
      type: 'FeatureCollection',
      features: svg.selectAll('path').data()
    };

    $scope.resetElementForm();
    $scope.markAsDirty();

    return $scope.updateView(geoJson);

  }

  $scope.confirmEditElement = function() {
    if (!$scope.elementData.element) return;
    $scope.elementForm.$submitted = true;
    if(!$scope.elementForm.$valid) return;

    var path = d3.select($scope.elementData.element);
    var geojson = $scope.map.geojson.data;

    // Retrieve the source features
    var feature = path.data()[0] || {};
    if (!feature) throw new Error('No data found in the selected <path> element');

    // Get the source feature, not the copy
    var key = JSON.stringify(feature);
    feature = _.find(geojson.features, function(f) {
      return f.type === feature.type &&
        JSON.stringify(f) === key;
    });
    if (!feature) throw new Error('Feature not found in the source content');

    // Update the feature
    feature.properties = feature.properties || {};
    delete $scope.elementData.element;
    angular.merge(feature.properties, $scope.elementData);

    $scope.resetElementForm();
    $scope.markAsDirty();

    // Update the view, to apply changes
    $scope.updateView(geojson);
  }

  $scope.cancelEditElement = function() {
    $scope.resetElementForm();
  }

  $scope.cancel = function() {
    $scope.resetForms();
    $scope.map.geojson.data = null;

    d3.select('#' + $scope.shapeId + ' *').remove();
  }

  $scope.save = function() {
    var geoJson = $scope.map.geojson.data;
    if (!geoJson || !$scope.dirty) return; // Nothing to save

    $scope.countryForm.$submitted=true;
    if($scope.saving || // avoid multiple save
      !$scope.countryForm.$valid || !$scope.formData.country) {
      return $q.reject();
    }

    if (!csWallet.isLogin()) {
      return $scope.loadWallet().then($scope.save);
    }

    $scope.saving = true;
    var now = Date.now();
    console.debug('[map] [shape] Saving shape...');
    UIUtils.loading.show({template: 'Saving...'});

    var country = $scope.formData.country || 'fr';

    // Get existing ids
    return esShape.getAllIds()
      .then(function(existingIds) {
        return $q.all(_(geoJson.features||[]).map(function(feature, index) {

          // Normalize features properties
          feature.properties = $scope.getNormalizeProperties(feature.properties, {country: country});

          var isNew = angular.isUndefined(feature.properties.id)
            // if id already somewhere, force isNew = true (will compute another id)
            || !existingIds.includes(feature.properties.id);

          // Generate an id
          if (isNew) {
            for(var i = index; !feature.properties.id || existingIds.includes(feature.properties.id); i++) {
              feature.properties.id = country + '-' + i;
            }
            console.debug("[map] [shape] - Add {id: " + feature.properties.id + "}");
            existingIds.push(feature.properties.id);
            return esShape.add(feature);
          }
          else {
            console.debug("[map] [shape] - Update {id: " + feature.properties.id + "}");
            existingIds[feature.properties.id] = true;
            return esShape.update(feature, {id: feature.properties.id})
          }
        }))
      })

      .then(function() {
        console.debug('[map] [shape] Shape saved in {0}ms'.format(Date.now() - now));
        $scope.saving = false;

        // Wait 2s (for pod propagation), then reload
        return $timeout(function() {
          return $scope.load({country: country});
        }, 2000);
      })
      .then(function() {
        return UIUtils.toast.show("MAP.SHAPE.EDIT.INFO.SAVED");
      })
      .catch(function(err) {
        $scope.saving = false;
        UIUtils.toast.show("MAP.SHAPE.EDIT.INFO.SAVED");
        return UIUtils.onError("MAP.SHAPE.EDIT.ERROR.SAVE_FAILED")(err);
      });
  }

  $scope.getNormalizeProperties = function(properties, defaults) {
    return {
      country: properties && properties.country || (defaults && defaults.country),
      name: properties && (properties.name || properties.title || properties.label || properties.nom),
      id: (properties && properties.id) || (defaults && defaults.id) || (properties && properties.code) ,
      position: properties && properties.position,
      order: properties && properties.order || undefined,
    };
  }

  $scope.findSvgElementFromPath = function(element) {
    var path = d3.select(element);

    console.log(path);
    console.log(path.bounds());
  }

  $scope.searchOnPath = function() {
    if (!$scope.elementData.element) return;

    // Update the leaflet map
    var features = d3.select($scope.elementData.element).data();

    if (!features || !features.length) return; // Skip

    var feature = features[0];
    var properties = $scope.getNormalizeProperties(feature.properties);
    var location = properties.name;

    $rootScope.geoShapes = $rootScope.geoShapes || {};
    $rootScope.geoShapes[location] = feature.geometry;
    $state.go('app.market_lookup', {location: location});
  }
}
