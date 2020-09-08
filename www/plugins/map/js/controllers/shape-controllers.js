var d3Transform;

angular.module('cesium.map.shape.controllers', ['cesium.services', 'cesium.map.shape.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.map_shape_country_edit', {
        url: "/map/country/edit",
        views: {
          'menuContent': {
            templateUrl: "plugins/map/templates/shape/edit_shape.html",
            controller: 'MapCountryEditCtrl'
          }
        }
      })
  })

  .controller('MapShapeViewCtrl', MapShapeViewController)

  .controller('MapCountryEditCtrl', MapCountryEditController);


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

    return esShape.geoJson.search({country: country})
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

    console.warn('[shape] No handler for SVG element click', element);

  };
}



function MapCountryEditController($scope, $rootScope, $state, $controller, $timeout, $q, leafletData, $translate,
                                  FileSaver, UIUtils, MapUtils, csWallet, esShape) {
  'ngInject';

  $scope.entered = false;
  $scope.saving = false;
  $scope.formData = {
    country: null,
    errors: null
  };
  $scope.configData = {
    geoViewBox: {
      leftLng: null,
      rightLng: null,
      topLat: null,
      bottomLat: null,
    },
    scale: 1,
    translateX: 0,
    translateY: 0,

    removeHole: true,
    applyRound: true,
    degreePrecision: esShape.constants.projection.degreePrecision,
    strictMode: false
  };
  $scope.showConfig = false;
  $scope.elementData = {
    country: null,
    id: null,
    title: null,
    position: 'main',
    order: undefined
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
        fillColor: esShape.constants.style.defaults.fill,
        fillOpacity: 0.7,
        color: esShape.constants.style.defaults.stroke,
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
      options.country ? esShape.geoJson.search({country: options.country}) : $q.when(),
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
    $scope.resetForm(data);
    $scope.resetConfigForm(data);
    $scope.resetElementForm(data);
  };

  $scope.resetForm = function(data) {
    $scope.formData.country = (data && data.country) || null;
    $scope.formData.errors = (data && data.errors) || null;
  };

  $scope.resetConfigForm = function(data) {
    angular.merge($scope.configData, {
      geoViewBox: {
        leftLng: (data && data.geoViewBox && data.geoViewBox.leftLng) || -180,
        rightLng: (data && data.geoViewBox && data.geoViewBox.rightLng) || 180,
        topLat: (data && data.geoViewBox && data.geoViewBox.topLat) || 90,
        bottomLat: (data && data.geoViewBox && data.geoViewBox.bottomLat) || -90
      },
      scale: (data && data.scale) || 1,
      translateX: (data && data.translateX) || 0,
      translateY: (data && data.translateY) || 0,
      svgText: (data && data.svgText) || null,
      removeHole: true,
      applyRound: true,
      degreePrecision: esShape.constants.projection.degreePrecision,
      strictMode: false
    });
  };

  $scope.resetElementForm = function(data) {
    var position = (data && data.position) || 'main';
    angular.merge($scope.elementData, {
      id: data && data.id || null,
      title: data && data.title || null,
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
  $scope.setConfigForm = function(form) {
    $scope.configForm = form;
  };
  $scope.setElementForm = function(form) {
    $scope.elementForm = form;
  };

  $scope.onFileChanged = function(event) {
    if (!event || !event.file || !event.fileContent) return; // Skip

    $scope.loading = true;
    try {
      var geoJson;
      // Add SVG file
      if (event.file.type.startsWith('image/svg')) {
        console.debug('[map] [shape] Loading SVG file {0}'.format(event.fileData && event.fileData.name));
        $scope.updateFromSvgFile(event.fileContent);
      }

      // Geo json file
      else {
        console.debug('[map] [shape] Loading GeoJson file {0}'.format(event.fileData && event.fileData.name));
        $scope.updateFromGeoJson(event.fileContent);
      }
    }
    catch(err) {
      console.error(err);
      UIUtils.onError('MAP.SHAPE.EDIT.ERROR.INVALID_SVG')(err);

      $scope.resetForms();
      $scope.dirty = false;
      $scope.showConfigForm = false;
    }
    finally {
      $scope.loading = false;
    }
  };

  $scope.updateFromSvgFile = function(svgText) {


    UIUtils.loading.show();
    try {
      // Create a SVG element, to be able to read bounds
      var svg = esShape.svg.createFromText(svgText, {
        selector: '#' + $scope.shapeId,
        //class: 'ng-hide'
      });

      // Create config
      var config = {
        geoViewBox: esShape.svg.findGeoViewBox(svg),
        customProjection: true,
        scale: 1,
        translateX: 0,
        translateY: 0,
        svgText: svgText
      }
      if (config.geoViewBox) {
        var proj = esShape.svg.projectionData(svg, {
          geoViewBox: config.geoViewBox
        });
        if (proj) {
          config.customProjection = false;
          config.scale = proj.scale;
          config.translateX = proj.translate[0];
          config.translateY = proj.translate[1];
        }
      }

      $scope.resetConfigForm(config);

      $scope.showConfig = true;
      $scope.applySvgConfig(svg, angular.merge(config, {
        customProjection: true // Force to use computed projection
      }));
      svg.remove();

    }
    finally {
      UIUtils.loading.hide();
    }
  };

  $scope.updateFromGeoJson = function(geoJson) {
    geoJson = typeof geoJson === 'string' ? JSON.parse(geoJson) : geoJson;
    $scope.showConfigForm = false;
    $scope.resetForms();
    $scope.markAsDirty();

    $scope.updateView(geoJson);
  };

  $scope.updateView = function(geoJson, options) {
    var selector = '#' + $scope.shapeId;
    if (!geoJson) {
      esShape.svg.remove({selector: selector});
    }
    else {
      _($scope.positions).each(function(position) {
        d3.selectAll([selector, '.' + position, 'svg'].join(' ')).remove();
      })

      // Normalize each features properties
      _(geoJson.features||[]).each(function(feature) {
        feature.properties = $scope.getNormalizeProperties(feature.properties||{}, options);
      })

      esShape.svg.createMosaic(geoJson, {
        selector: selector,
        onclick: $scope.onPathClick
      });
    }

    $scope.resetElementForm({country: options && options.country});
    $scope.map.geojson.data = geoJson;
    return $q.when();
  };

  $scope.applySvgConfig = function(svg, config) {

    config = config || $scope.configData;
    //if ($scope.loading) return; // Skip

    if ($scope.configForm) {
      $scope.configForm.$submitted = true;
      if(!$scope.configForm.$valid) return;
    }

    console.debug('[map] [shape] Apply config: ', config);

    // Converting SVG into geojson, using the config
    var svg = svg || esShape.svg.createFromText(config.svgText, {
      selector: '#' + $scope.shapeId,
      class: 'ng-hide'
    });

    var convertOptions = {
      selector: '#' + $scope.shapeId,
      geoViewBox: config.geoViewBox,
      precision: $scope.configData.applyRound && $scope.configData.degreePrecision,
      strictMode: $scope.configData.strictMode,
      removeHole: $scope.configData.removeHole
    };
    if (config.customProjection) {
      convertOptions.scale = config.scale || 1;
      convertOptions.translate = [config.translateX||0, config.translateY||0];
    }

    var geoJson = esShape.svg.toGeoJson(svg, convertOptions);

    $scope.updateView(geoJson);
  };

  $scope.onPathClick = function(event, element) {

    console.debug('[map] [shape] Start edit element:', element);
    var path = d3.select(element);

    var geoJson = path.data()[0] || {};

    var properties = $scope.getNormalizeProperties(geoJson.properties || {});
    $scope.resetElementForm(properties);
    $scope.elementData.element = element;

    $scope.$apply();
  };

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

  };

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
  };

  $scope.cancelEditElement = function() {
    $scope.resetElementForm();
  };

  $scope.cancel = function() {
    $scope.resetForms();
    $scope.map.geojson.data = null;
    $scope.showConfig = false;

    d3.select('#' + $scope.shapeId + ' *').remove();
  };

  $scope.save = function() {
    var geoJson = $scope.map.geojson.data;
    if (!geoJson || !$scope.dirty) return; // Nothing to save

    // Reset errors
    $scope.formData.errors = null;

    $scope.countryForm.$submitted=true;
    if($scope.saving || // avoid multiple save
      !$scope.countryForm.$valid || !$scope.formData.country) {
      return $q.reject();
    }

    if (!csWallet.isLogin()) {
      return $scope.loadWallet().then($scope.save);
    }

    $scope.saving = true;
    var country = $scope.formData.country || 'fr';

    return UIUtils.loading.show({template: 'Saving...'})
      .then(function() {
        return esShape.save(geoJson, {
          country: country,
          removeHole: $scope.configData.removeHole,
          precision: $scope.configData.applyRound && $scope.configData.degreePrecision || null,
          strictMode: $scope.configData.strictMode,
          updateProgression: function(feature, index, total) {
            var title = feature.properties && (feature.properties.title || feature.properties.id) || (''+ index);
            UIUtils.loading.show({template: 'Saving <b>{0}</b>... ({1}/{2})'.format(title, index+1, total)});
          }
        })
      })
      .then(function() {
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
        UIUtils.onError("MAP.SHAPE.EDIT.ERROR.SAVE_FAILED")(err);
        if (err && err.errors) {
          $scope.formData.errors = err && err.errors || null;
        }
        else if (err.message) {
          $scope.formData.errors = [err];
        }
      })
      .then(function() {
        $scope.saving = false;
      });
  };

  $scope.getNormalizeProperties = function(properties, defaults) {
    return {
      id: (properties && properties.id) || (defaults && defaults.id) || (properties && properties.code),
      title: properties && (properties.title || properties.name || properties.label || properties.nom),
      country: properties && properties.country || (defaults && defaults.country),
      position: properties && properties.position,
      order: properties && properties.order || undefined,
    };
  };

  $scope.findSvgElementFromPath = function(element) {
    var path = d3.select(element);

    console.log(path);
    console.log(path.bounds());
  };

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
  };

  $scope.download = function() {
    if ($scope.loading || $scope.saving || !$scope.map.geojson.data) return;

    var content = JSON.stringify($scope.map.geojson.data);
    var file = new Blob([content], {type: 'application/geo+json; charset=utf-8'});
    var filename = ($scope.formData.country || 'export') + '.geojson';

    FileSaver.saveAs(file, filename);
  };

  $scope.centerMap = function(center) {
    console.debug('[map] [shape] Center map to:', center);

    // Rename longitude
    center.lng = angular.isDefined(center.lon) ? center.lon : center.lng;
    center.zoom = center.zoom || $scope.map.center.zoom || 10;

    // If re apply center again, increase zoom
    if (center.lat === $scope.map.center.lat
      && center.lng === $scope.map.center.lng
      && center.zoom === $scope.map.center.zoom) {
      center.zoom += 2;
    }

    angular.merge($scope.map.center, center);
  };

  // -- for DEV only --
  /*$scope.formData.errors = [
    {message: 'MAP.SHAPE.EDIT.ERROR.SELF_INTERSECTION', messageParams: {id: 'US-MI'}, lat: 5, lon: 5}
  ];*/


}
