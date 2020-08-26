var svgtogeojson;

angular.module('cesium.market.map.controllers', ['cesium.market.record.services', 'cesium.services'])

  .controller('MkCountryMapCtrl', function($scope, $translate, $timeout, UIUtils, csConfig, csSettings, mkRecord) {
    'ngInject';

    var
      activeStyle = {
        'fill': '#56d67a'
      },
      defaultStyle = {
        'fill': '#472b67',
        'fill-opacity': 1,
        'stroke': 'white',
        'stroke-opacity': 1,
        'stroke-width': 0.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-miterlimit': 10,
        '-webkit-transition': 'all 500ms',
        'cursor': 'pointer'
      }
    $scope.loading = true;
    $scope.selectedCountry = null;
    $scope.countriesMap = {
      fr: 'France',
      be: 'Belgium',
      es: 'Spain',
      gb: 'United Kingdom',
      us: 'USA'
    };
    $scope.countries = Object.keys($scope.countriesMap);

    $scope.initProps = {
      '.regions': defaultStyle,
      '.mapsvg-region': defaultStyle
    }

    $scope.bindingEvents = {
      '.regions': ['mouseover', 'mouseout', 'click'],
      '.mapsvg-region': ['mouseover', 'mouseout', 'click']
    }
    $scope.props = {};

    $scope.load = function(options) {
      options = options || {};
      options.silent = angular.isDefined(options.silent) ? options.silent : false;
      if (options.silent) $scope.loading = true;

      console.debug('[country-map] Loading country map...');

      //options.country = 'test';

      // Try to get from locale
      if (!options.country) {
        var locale = csSettings.data.locale || {id : $translate.use()};
        var localCountry = locale && locale.country || locale.id.split('-')[1];

        options.country = localCountry && _.find($scope.countries, function(c) {
          return c.toUpperCase() === localCountry.toUpperCase();
        });
      }
      if (!options.country && csConfig.plugins && csConfig.plugins.es && csConfig.plugins.es.defaultCountry) {
        options.country = _.find($scope.countries, function(c) {
          var title = $scope.countriesMap[c];
          return title && title.toUpperCase() === csConfig.plugins.es.defaultCountry;
        }) || 'fr'; // Default country
      }
      $scope.selectedCountry = options.country || 'fr'; // default map
      $scope.loading = false;
    }

    $scope.onChangeCountry = function(country) {
      if (!country) return; // Skip
      console.debug('[country-map] Select country map:', country);
      return $scope.load({country: country});
    }

    // Watch locale change, to reload categories
    $scope.onLocaleChange = function(localeId) {
      console.debug('[market] [map] Reloading map, because locale changed to ' + localeId);
      var locale = _.findWhere(csSettings.locales, {id: localeId}) || {id : $translate.use()};
      var country = locale && (locale.country || locale.id.split('-')[1]);
      return $scope.onChangeCountry(country);
    };
    csSettings.api.locale.on.changed($scope, $scope.onLocaleChange, this);

    $scope.handleEvent = function(event) {
      if (event.name === 'mouseover') {
        var selector = $scope.getElementSelector(event.element);
        if (selector) {
          $scope.props[selector] = activeStyle;
          $scope.$digest();
        }

      }
      else if (event.name === 'mouseout') {
        var selector = $scope.getElementSelector(event.element);
        if (selector) {
          $scope.props[selector] = {};
          $scope.$apply();
        }
      }
      else if (event.name === 'click') {
        $scope.onClick(event.element);
      }
    }

    $scope.getElementSelector = function(element) {
      if (element.id) {
        return '#' + element.id;
      }
      var selector = '';
      var elementClassList = element.classList;
      elementClassList.forEach(function(clazz) {
        selector += '.' + clazz;
      });
      return 'path' + selector; // Remove first space
    };

    $scope.onClick = function(element) {
      console.debug('[country-map] Click on path:', element);

      $scope.convert(element.parentNode);
      // Get the parent view box
      /*var coefs = $scope.computexCoefs(element.parentNode);

      var geometry = element.attributes['d'].textContent;
      if (geometry.startsWith('m ')) {
        var svgPoints = geometry.substr(2).split(' ');
        var geoPoints = _.map(svgPoints, function(position) {
          var parts = position.split(',');
          return {
            lon: coefs.offsetX + parseFloat(parts[0]) * coefs.coefX,
            lat: coefs.offsetY + parseFloat(parts[1]) * coefs.coefY
          };
        });
        console.log(geoPoints);
      }
      else {
        console.warn('[country-map] Unknown geometry type (unable to parse): ', geometry);
      }*/

    };

    $scope.convert = function(svgElement) {
      console.debug('[country-map] Converting');

      var svgElement = svgElement || document.getElementById('mysvg');

      var geoViewBox = svgElement.attributes['mapsvg:geoViewBox'] || svgElement.attributes['mapsvg:geoviewbox'];
      geoViewBox = geoViewBox && geoViewBox.textContent.split(' ');
      if (!geoViewBox) {
        console.error("[country-map] Missing <svg> attribute 'mapsvg:geoViewBox', in SVG file for country: " + $scope.selectedCountry);
      }
      var geoJson;
      // TODO: convert to GeoJSON
      /*
      geoJson = geoViewBox && svgtogeojson.svgToGeoJson(
        [[geoViewBox[1], geoViewBox[0]], [geoViewBox[3], geoViewBox[2]]],
        svgElement,
        3
      );
      document.getElementById('demolink').href = "http://geojson.io/#data=data:application/json," + encodeURIComponent(JSON.stringify(geoJson));
      */
    };

    $scope.computexCoefs = function(svgElement) {
      // Get the parent view box
      var viewBox = svgElement.attributes['viewBox'];
      var geoViewBox = svgElement.attributes['mapsvg:geoViewBox'];
      if (viewBox && geoViewBox) {
        viewBox = viewBox.textContent.split(' ');
        viewBox = {
          x0: viewBox[0],
          y0: viewBox[1],
          x1: viewBox[0] + viewBox[2],
          y1: viewBox[1] + viewBox[3],
        };
        geoViewBox = geoViewBox.textContent.split(' ');
        geoViewBox = {
          x0: geoViewBox[0],
          y0: geoViewBox[1],
          x1: geoViewBox[2],
          y1: geoViewBox[3],
        };
        var coefX = -1 * (geoViewBox.x1 - geoViewBox.x0) / (viewBox.x0 - viewBox.x1);
        var coefY = (geoViewBox.y1 - geoViewBox.y0) / (viewBox.y0 - viewBox.y1);
        return {
          offsetX: viewBox.x0 * coefX,
          offsetY: viewBox.y0 * coefY,
          coefX: coefX,
          coefY: coefY
        }
      }
    };

    $scope.computePosition = function(element) {
      console.debug('[country-map] Click on path:', element);

      // Get the parent view box
      var svgElement = element.parentNode;
      var viewBox = svgElement.attributes['viewBox'];
      var geoViewBox = svgElement.attributes['mapsvg:geoViewBox'];
      if (viewBox && geoViewBox) {
        viewBox = viewBox.textContent.split(' ');
        viewBox = {
          x0: viewBox[0],
          y0: viewBox[1],
          x1: viewBox[0] + viewBox[2],
          y1: viewBox[1] + viewBox[3],
        };
        geoViewBox = geoViewBox.textContent.split(' ');
        geoViewBox = {
          x0: geoViewBox[0],
          y0: geoViewBox[1],
          x1: geoViewBox[2],
          y1: geoViewBox[3],
        };
        var coefX = -1 * (geoViewBox.x1 - geoViewBox.x0) / (viewBox.x0 - viewBox.x1);
        var coefY = (geoViewBox.y1 - geoViewBox.y0) / (viewBox.y0 - viewBox.y1);
        console.table("x=" + coefX, "y=" + coefY);
      }
    };
  })
;
