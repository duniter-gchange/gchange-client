// var d3;

angular.module('cesium.map.svg.services', ['cesium.services', 'cesium.map.utils.services'])

  /**
   * SVG utility service
   * Inspire from https://github.com/davecranwell/svg-to-geojson/blob/master/source/index.js
   */
  .factory('SvgUtils', function() {
    'ngInject'

    var constants = {
      attributes: {
        geoViewBox: 'gchange:geoViewBox',
        viewBox: 'viewBox'
      }
    }

    function findGeoViewBox(svgElement) {
      if (!svgElement) return undefined;

      var geoViewBox = svgElement.attributes[constants.attributes.geoViewBox]
        // Retry in lowercase
        || svgElement.attributes[constants.attributes.geoViewBox.toLowerCase()];

      // Not found: try on parent node
      if (!geoViewBox) return findGeoViewBox(svgElement.parentNode);

      var parts = geoViewBox.textContent.split(' ');
      if (parts.length !== 4) throw new Error('Invalid geoViewBox value. Expected: "left-lng top-lat right-lng bottom-lat"');
      return {
        leftLng: parseFloat(parts[0]),
        topLat: parseFloat(parts[1]),
        rightLng: parseFloat(parts[2]),
        bottomLat: parseFloat(parts[3])
      };
    }

    function findViewBox(svgElement) {
      if (!svgElement) return undefined;

      var viewBox = svgElement.attributes[constants.attributes.viewBox]
        // Retry in lowercase
        || svgElement.attributes[constants.attributes.viewBox.toLowerCase()];

      // Try with width and height attributes
      if (!viewBox) {
        var width = svgElement.attributes['width'];
        var height = svgElement.attributes['height'];
        if (width && height) {
          return {
            minX: 0,
            minY: 0,
            width: parseFloat(width),
            height: parseFloat(height)
          };
        }
      }

      // Not found: try on parent node
      if (!viewBox) return findViewBox(svgElement.parentNode); // recursive call

      var parts = viewBox.textContent.split(' ');
      if (parts.length !== 4) throw new Error('Invalid geoViewBox value. Expected: "minx-x min-y width height"');
      return {
        minX: parseFloat(parts[0]),
        minY: parseFloat(parts[1]),
        width: parseFloat(parts[2]),
        height: parseFloat(parts[3])
      };
    }

    function getCoords(element, viewBox) {

      if (element.tagName === 'rect') {
        var x = element.x.baseVal.value;
        var y = element.y.baseVal.value;
        var height = element.height.baseVal.value;
        var width = element.width.baseVal.value;
        return [
          [x, y],
          [x, y + height],
          [x + width, y + height],
          [x + width, y],
          [x, y]
        ];
      }

      var pathDataStr = element.attributes['d'] && element.attributes['d'].textContent;
      if (!pathDataStr) return [];

      // Normalized path (add space, to be able to split)
      pathDataStr = pathDataStr.trim()
        .replace(/([0-9])-([0-9])/g, '$1,$2')
        .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
        .replace(/([a-zA-Z])([-0-9])/g, '$1 $2');

      var pathData = pathDataStr.split(' ');
      var actionRegexp = /^[a-zA-Z]/;

      var coords = [];
      var action;
      _(pathData || []).forEach(function(pathitem, index) {

        // Parse action
        if (actionRegexp.test(pathitem)) {
          action = pathitem.substr(0,1);
          // Remove the action, then continue
          pathitem = pathitem.substr(1);
        }

        if (pathitem && pathitem.trim().length > 0) {
          var parts = pathitem.split(',');
          parts = _(parts).map(parseFloat);
          var prevLength = coords.length;
          var prevCoords = prevLength && coords[prevLength -1];

          switch (action) {
            // Close
            case 'z':
            case 'Z':
              /**
               * If Close Path command found, copy first pathData value
               * into last position, as per GeoJSON requirements for
               * closed polygons.
               */
              if (coords.length) {
                coords.push(coords[0])
              }
              break;

            // Move (absolute)
            case 'M':
              if (parts.length === 2) coords.push(parts);
              break;

            // Move (relative)
            case 'm':
              if (parts.length === 2) {
                if (!prevCoords) {
                  if (viewBox) {
                    coords.push([parts[0] + viewBox.minX, parts[1] + viewBox.minY]);
                  }
                  else {
                    coords.push(parts);
                  }
                }
                else coords.push([parts[0] + prevCoords[0], parts[1] + prevCoords[1]]);
              }
              break;

            // Line (absolute)
            case 'L':
              if (parts.length === 2) {
                coords.push(parts);
              }
              break;

            // Line (relative)
            case 'l':
              if (parts.length === 2) {
                if (!prevCoords) {
                  coords.push(parts);
                }
                else {
                  coords.push([parts[0] + prevCoords[0], parts[1] + prevCoords[1]]);
                }
              }
              break; // skip

            // Line horizontal (absolute)
            case 'H':
              if (parts.length === 1) {
                if (!prevCoords) {
                  coords.push([parts[0], 0]);
                }
                else {
                  coords.push([parts[0], prevCoords[1]]);
                }
              }
              break;

            // Line horizontal (relative)
            case 'h':
              if (parts.length === 1) {
                if (!prevCoords) {
                  coords.push([parts[0], 0]);
                }
                else {
                  coords.push([parts[0] + prevCoords[0], prevCoords[1]]);
                }
              }
              break;

            // Line vertical (absolute)
            case 'V':
              if (parts.length === 1) {
                if (!prevCoords) {
                  coords.push([0, parts[0]]);
                }
                else {
                  coords.push([prevCoords[0], parts[0]]);
                }
              }
              break;

            // Line vertical (relative)
            case 'v':
              if (parts.length === 1) {
                if (!prevCoords) {
                  coords.push([0, parts[0]]);
                }
                else {
                  coords.push([prevCoords[0], parts[0] + prevCoords[1]]);
                }
              }
              break; // skip

            // Other case
            default:

              break; // skip
          }

          // If nothing changed : warn
          if (prevLength === coords.length) {
            console.warn("[svg] Ignoring unknown SVG action '{0}' '{1}'".format(action, pathitem));
            if (parts && parts.length === 2) {
              //coords.push([parseFloat(parts[0]), parseFloat(parts[1])]);
            }
          }
        }
      });
      return coords;
    }

    function toGeoJson(svgElement, options) {
      if (!svgElement) throw new Error("Missing required 'svgElement' argument");

      options = options || {};
      options.attributes = options.attributes || [];
      options.multiplier = options.multiplier || 1;
      var geoViewBox = options.geoViewBox || findGeoViewBox(svgElement);

      if (!geoViewBox) {
        throw new Error("Bad SVG format: missing attribute '{0}'".format(constants.attributes.geoViewBox));
      }

      var viewBox = findViewBox(svgElement);
      if (!viewBox) {
        throw new Error("Bad SVG format: missing attribute '{0}'".format(constants.attributes.viewBox));
      }
      var mapX = d3.scaleLinear()
        .range([geoViewBox.leftLng, geoViewBox.rightLng])
        .domain([viewBox.minX, viewBox.width])
      ;
      var mapY = d3.scaleLinear()
        .range([geoViewBox.topLat, geoViewBox.bottomLat])
        .domain([viewBox.minY, viewBox.height]);

      var geoJson = {
        type: 'FeatureCollection',
        features: []
      };

      var coords = getCoords(svgElement);

      const mappedCoords = [];
      _(coords||[]).forEach(function(coord) {
        if (coord[0] !== null && coord[1] !== null) {
          // Map points onto d3 scale
          mappedCoords.push([
            mapX(coord[0]) * options.multiplier,
            mapY(coord[1]) * options.multiplier,
          ]);
        }
      });

      var properties = {};
      _(options.attributes||[]).forEach(function (attr) {
        var value = elem.getAttribute(attr);
        if (value)
          properties[attr] = value;
      });

      geoJson.features.push({
        type: 'Feature',
        properties: properties,
        geometry: {
          type: (svgElement.tagName === 'polyline') ? 'LineString' : 'Polygon',
          coordinates: (svgElement.tagName === 'polyline') ? mappedCoords : [mappedCoords],
        },
      });


      return geoJson;
    }

    return {
      findGeoViewBox,
      findViewBox,
      toGeoJson
    }
  })

