// var d3;

angular.module('cesium.map.shape.services', ['cesium.services', 'cesium.map.utils.services', 'cesium.graph.color.services'])

  /**
   * Shape service
   */
  .factory('esShape', function(esHttp, gpColor) {
    'ngInject'

    var defaultSearchLimit = 100;

    var
      fields = {
        commons: ['type', 'geometry', 'properties']
      },
      constants = {
        attributes: {
          geoViewBox: 'gchange:geoViewBox',
          viewBox: 'viewBox'
        },
        defaults: {
          fill: '#1a237e', //
          stroke: 'lightgrey'
        },
        active: {
          fill: gpColor.rgba.balanced(),
        },
        positions: [
          'main',
          'bottomleft', 'bottomright',
          'topleft', 'topright'
        ]
      },
      raw = {
        postSearch: esHttp.post('/shape/record/_search'),
        get: esHttp.get('/shape/record/:id'),
        getCommons: esHttp.get('/shape/record/:id?_source=' + fields.commons.join(',')),
        add: esHttp.record.post('/shape/record'),
        update: esHttp.record.post('/shape/record/:id/_update'),
        remove: esHttp.record.remove('shape', 'record')
      };

    function readFromHit(hit, options) {
      var record = hit._source;
      record.id = hit._id;

      return record;
    }

    function getShape(options) {
      if (!options) throw new Error("Missing 'options' argument");

      console.debug("[map] [shape] Loading shape from options: ", options);

      var matches = [];
      var filters = [];

      // Add filter
      if (options.country) {

        filters.push({
          nested: {
            path: "properties",
            query: {
              bool: {
                filter: {
                  term: {"properties.country": options.country}
                }
              }
            }
          }
        });
      }

      // Create the request
      var request = {};
      if (matches.length) {
        request.query = {bool: {}};
        request.query.bool.should =  matches;
        request.query.bool.minimum_should_match = 1;
      }
      if (filters.length) {
        request.query = request.query || {bool: {}};
        request.query.bool.filter =  filters;
      }
      request.from = request.from || 0;
      request.size = request.size || defaultSearchLimit;
      if (request.size < defaultSearchLimit) request.size = defaultSearchLimit;
      request._source = request._source || fields.commons;

      return raw.postSearch(request)
        .then(function(res) {
          if (!res || !res.hits || !res.hits.total) return undefined;

          var features = (res.hits.hits || []).reduce(function(res, hit) {
            var record = readFromHit(hit, options);
            return res.concat(record);
          }, []);

          return {
            type: 'FeatureCollection',
            features: features
          };
        });
    }

    function getAllShapeIds() {
      return raw.postSearch({
        size: 1000,
        _source: 'properties.id'
      })
        .then(function(res) {
          if (!res || !res.hits || !res.hits.total) return [];

          return _.pluck(res.hits.hits, '_id');
        })
    }

    function getAllCountries() {
      return raw.postSearch({
        size: 0,
        aggs: {
          countries: {
            nested: {
              path: "properties"
            },
            aggs: {
              names: {
                terms: {
                  field: "properties.country",
                  size: 0
                }
              }
            }
          }
        }
      })
        .then(function(res) {
          if (!res || !res.hits || !res.hits.total) return [];

          return res.aggregations.countries.names.buckets.reduce(function(res, bucket){
            return res.concat({
              id: bucket.key,
              docCount: bucket.doc_count
            });
          }, []);
        })
    }

    function createSvg(geoJson, options) {
      if (!geoJson) throw new Error('Missing geoJson argument');
      options = options || {};
      options.onclick = options.onclick || function() { console.debug("TODO: handle click on a SVG element");};

      // Remove existing svg
      if (options.selector && options.append !== true) {
        d3.selectAll(options.selector + ' svg').remove();
      }
      var selector = options.selector || 'body'
      var container = d3.select(selector);
      if (options.selector && container.empty()) throw new Error("Cannot found element '{0}'".format(selector));

      // Width and height
      var width = options.width || container.node().getBoundingClientRect().width,
        height = options.height || width;

      // Define map projection
      var projection = d3.geoMercator()
        .translate([0, 0])
        .scale(1);

      // Define path generator
      var path = d3.geoPath()
        .projection(projection);

      // Create SVG element
      var svg = container
        .append("svg")
        // Responsive SVG needs these 2 attributes and no width and height attr.
        .attr("preserveAspectRatio", "xMinYMin meet")
        .attr("viewBox", [0, 0, width, height].join(' '))

        .attr("width", width)
        .attr("height", height);

      if (options.class) {
        svg.attr('class', options.class);
      }

      // Calculate bounding box transforms for entire collection
      var bounds = path.bounds( geoJson ),
        left = bounds[0][0],
        top = bounds[0][1],
        right = bounds[1][0],
        bottom = bounds[1][1],
        dx = right - left,
        dy = bottom - top,
        x = (left + right) / 2,
        y = (top + bottom) / 2,
        scale = .95 / Math.max(dx / width, dy / height),
        //translate = [width / 2 - scale * x, height /2 - scale * x];
        translate = [(width - scale * (right + left)) / 2, (height - scale * (bottom + top)) / 2];

      // Update the projection
      projection
        .scale(scale)
        .translate(translate);

      //Bind data and create one path per GeoJSON feature
      svg.selectAll("path")
        .data(geoJson.features)
        .enter()
        .append("path")
        .attr("d", path)
        .on("mouseover", function(d) {
          d3.select(this)
            .style("fill", constants.active.fill)
            .style("cursor", "pointer")
          ;
        })
        .on("mouseout", function(d) {
          d3.select(this).style("fill", constants.defaults.fill);
        })
        .on("click", function(event) {
          options.onclick(event, this);
        })
        .style("fill", constants.defaults.fill)
        .style("stroke", constants.defaults.stroke)
        .append("svg:title").text(function(d){
          return d.properties['name'];
        });

      return svg;
    }

    function createSvgMosaic(geoJson, options) {
      if (!geoJson) throw new Error("Missing 'geoJson' argument");
      if (!geoJson.features) throw new Error("Missing 'geoJson.features' argument");

      options = options || {};

      var selector = options.selector || 'body'
      var container = d3.select(selector)
        .classed('shape-container', true);
      if (options.compacted) {
        container.classed('compacted', true);
      }
      else {
        options.compacted = container.classed('compacted');
      }


      if (options.selector && container.empty()) throw new Error("Cannot found element: '{0}'".format(selector));

      // Width and height
      var width = options.width || container.node().getBoundingClientRect().width,
        height = options.height || width;

      // Split features by position
      var featuresByPosition = _.groupBy(geoJson.features, function(feature) {
        return feature.properties && feature.properties.position || 'main';
      });

      // Remove existing content
      container.selectAll('*').remove();

      _(Object.keys(featuresByPosition)).each(function(position) {

        container.append('div').classed(position, true);
        var svgSelector = selector + ' .' + position,
          features = featuresByPosition[position],
          svgWidth;

        // Add main features, as a features collection
        if (position === 'main') {
          svgWidth = options.compacted ? width : width * 0.8; // 100% if compacted, otherwise 80%
          createSvg({
            type: geoJson.type,
            features: features
          }, angular.merge({}, options, {
            selector: svgSelector,
            append: false,
            width: svgWidth,
            height: Math.min(svgWidth, height)
          }));
        }

        // For secondary position (left or right)
        else {
          // Sort features (using properties.order)
          _.sortBy(features, function(f) { return f.properties && f.properties.order || 999; });

          // Add a SVG per feature
          svgWidth = width * 0.1; // 10% of global width
          var svgOptions = angular.merge({}, options, {
            selector: svgSelector,
            append: true,
            width: svgWidth,
            height: Math.min(svgWidth, height / 12)
          });
          _.each(features, function(feature) {
            createSvg({
              type: geoJson.type,
              features: [feature]
            }, svgOptions);
          });
        }
      })

    }

    function removeSvg(options) {
      if (!options && !options.selector) throw new Error("Missing 'options.selector' argument");

      // Remove existing svg
      d3.select(options.selector + ' svg').remove();
    }

    function findSvgGeoViewBox(svgElement) {
      if (!svgElement) return undefined;

      var geoViewBox = svgElement.attr(':' + constants.attributes.geoViewBox)
        // Retry in lowercase
        || svgElement.attr(':' + constants.attributes.geoViewBox.toLowerCase());

      // Not found: try on parent node
      if (!geoViewBox) {
        var parent = svgElement.node().tagName !== 'svg' && d3.select(svgElement.node().parentNode);
        if (!parent || parent.empty()) return undefined;
        return findSvgGeoViewBox(parent);
      }

      var parts = geoViewBox.split(' ');
      if (parts.length !== 4) throw new Error('Invalid geoViewBox value. Expected: "left-lng top-lat right-lng bottom-lat"');
      return {
        leftLng: parseFloat(parts[0]),
        topLat: parseFloat(parts[1]),
        rightLng: parseFloat(parts[2]),
        bottomLat: parseFloat(parts[3])
      };
    }

    function findSvgViewBox(svgElement) {
      if (!svgElement) return undefined;

      var viewBox = svgElement.attr(constants.attributes.viewBox)
        // Retry in lowercase
        || svgElement.attr(constants.attributes.viewBox.toLowerCase());

      // Try with width and height attributes
      if (!viewBox) {
        var width = svgElement.attr('width');
        var height = svgElement.attr('height');
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
      if (!viewBox) {
        var parent = svgElement.node().tagName !== 'svg' && d3.select(svgElement.node().parentNode);
        if (!parent || parent.empty()) return undefined;
        return findSvgViewBox(parent); // recursive call
      }

      var parts = viewBox.split(' ');
      if (parts.length !== 4) throw new Error('Invalid geoViewBox value. Expected: "minx-x min-y width height"');
      return {
        minX: parseFloat(parts[0]),
        minY: parseFloat(parts[1]),
        width: parseFloat(parts[2]),
        height: parseFloat(parts[3])
      };
    }

    function getSvgPathCoords(element, viewBox) {
      if (typeof element.node !== 'function') {
        element = d3.select(element);
      }
      if (element.node().tagName === 'svg') {
        throw new Error("Invalid 'svgElement': must be child of <svg> tag, but not the <svg> tag itself.");
      }
      
      if (element.node().tagName === 'rect') {
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

      if (element.node().tagName === 'path') {
        var pathDataStr = element.attr('d');
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
        _(pathData || []).forEach(function (pathitem, index) {

          // Parse action
          if (actionRegexp.test(pathitem)) {
            action = pathitem.substr(0, 1);
            // Remove the action, then continue
            pathitem = pathitem.substr(1);
          }

          if (pathitem && pathitem.trim().length > 0) {
            var parts = pathitem.split(',');
            parts = _(parts).map(parseFloat);
            var prevLength = coords.length;
            var prevCoords = prevLength && coords[prevLength - 1];

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
                    } else {
                      coords.push(parts);
                    }
                  } else coords.push([parts[0] + prevCoords[0], parts[1] + prevCoords[1]]);
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
                  } else {
                    coords.push([parts[0] + prevCoords[0], parts[1] + prevCoords[1]]);
                  }
                }
                break; // skip

              // Line horizontal (absolute)
              case 'H':
                if (parts.length === 1) {
                  if (!prevCoords) {
                    coords.push([parts[0], 0]);
                  } else {
                    coords.push([parts[0], prevCoords[1]]);
                  }
                }
                break;

              // Line horizontal (relative)
              case 'h':
                if (parts.length === 1) {
                  if (!prevCoords) {
                    coords.push([parts[0], 0]);
                  } else {
                    coords.push([parts[0] + prevCoords[0], prevCoords[1]]);
                  }
                }
                break;

              // Line vertical (absolute)
              case 'V':
                if (parts.length === 1) {
                  if (!prevCoords) {
                    coords.push([0, parts[0]]);
                  } else {
                    coords.push([prevCoords[0], parts[0]]);
                  }
                }
                break;

              // Line vertical (relative)
              case 'v':
                if (parts.length === 1) {
                  if (!prevCoords) {
                    coords.push([0, parts[0]]);
                  } else {
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
    }

    function convertSvgToGeoJson(svgElement, options) {
      if (!svgElement) throw new Error("Missing required 'svgElement' argument");

      options = options || {};
      options.attributes = options.attributes || [];
      options.multiplier = options.multiplier || 1;
      var selector = options.selector || 'body';

      var container = d3.select(selector);
      if (options.selector && container.empty()) throw new Error("Cannot found element: '{0}'".format(selector));

      var viewBox;
      if (typeof svgElement === 'string') {
        svgElement = d3.select(selector)
          //.append('div')
          //.attr('class', 'ng-hide')
          .html(svgElement)
          .select('svg');
        if (svgElement.empty()) throw new Error("Invalid 'svgElement' argument");
        viewBox = findSvgViewBox(svgElement);

        // Force width and height
        svgElement
          .attr('width', viewBox.width)
          .attr('height', viewBox.height);
      }
      else {
        svgElement = container.select('svg');
        viewBox = findSvgViewBox(svgElement);
      }

      if (!viewBox) {
        throw new Error("Bad SVG format: missing attribute '{0}'".format(constants.attributes.viewBox));
      }
      
      var geoViewBox = options.geoViewBox || findSvgGeoViewBox(svgElement);
      if (!geoViewBox) {
        throw new Error("Bad SVG format: missing attribute '{0}'".format(constants.attributes.geoViewBox));
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

      /*
      leftLng: parseFloat(parts[0]),
        topLat: parseFloat(parts[1]),
        rightLng: parseFloat(parts[2]),
        bottomLat: parseFloat(parts[3])
       */
      var width = viewBox.width - viewBox.minX,
        height = viewBox.height,
        geoWidth = geoViewBox.rightLng - geoViewBox.leftLng,
        geoHeight = geoViewBox.topLat - geoViewBox.bottomLat,
        dx = geoWidth / width,
        dy = geoHeight / height
        ;
      var projection = d3.geoMercator()
        //.translate([viewBox.minX / 1000, viewBox.minY / 1000])
        //.translate([geoViewBox.leftLng / dx, geoViewBox.topLat / dy])
        .translate([-300, 9900])
        .scale(9400);

      // Define path generator
      var path = d3.geoPath()
        .projection(projection);

      svgElement.selectAll('path').each(function(arg1, i) {
        var ele = d3.select(this);
        var coords = getSvgPathCoords(ele);
        if (i === 0) console.log(ele.data());

        const mappedCoords = [];
        _(coords||[]).forEach(function(coord, j) {
          if (coord[0] !== null && coord[1] !== null) {
            // Map points onto d3 scale
            var newCoords = projection.invert(coord) || [
              mapX(coord[0]) * options.multiplier,
              mapY(coord[1]) * options.multiplier,
            ];
            mappedCoords.push(newCoords);

            if (i === 0 && j === 0) {
              console.table(coord[0], coord[1], newCoords[0], newCoords[1]);
              console.log(projection.invert(coord));
              console.log(path);
            }
          }
        });

        var properties = {};
        _(options.attributes||[]).forEach(function (attr) {
          var value = ele.attr(attr);
          if (value)
            properties[attr] = value;
        });

        geoJson.features.push({
          type: 'Feature',
          properties: properties,
          geometry: {
            type: (ele.node().tagName === 'polyline') ? 'LineString' : 'Polygon',
            coordinates: (ele.node().tagName === 'polyline') ? mappedCoords : [mappedCoords],
          }
        });
      })

      return geoJson;
    }

    return {
      add: raw.add,
      update: raw.update,
      remove: raw.remove,

      // TODO : dev
      get: getShape,
      getAllIds: getAllShapeIds,
      getAllCountries: getAllCountries,
      svg: {
        create: createSvg,
        remove: removeSvg,
        createMosaic: createSvgMosaic,

        toGeoJson: convertSvgToGeoJson
      },

      constants: constants
    }
  })

