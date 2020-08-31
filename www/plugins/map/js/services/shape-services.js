// var d3;

angular.module('cesium.map.shape.services', ['cesium.services', 'cesium.map.utils.services', 'cesium.graph.color.services'])

  /**
   * Shape service
   */
  .factory('esShape', function(esHttp, gpColor) {
    'ngInject'

    var defaultSearchLimit = 100;

    var
      fields= {
        commons: ['type', 'geometry', 'properties']
      },
      constants = {
        defaults: {
          fill: '#1a237e', //
          stroke: 'lightgrey'
        },
        active: {
          fill: gpColor.rgba.balanced(),
        }
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

    function getAllCountries() {
      return raw.postSearch({
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
          }, [])
        })
    }

    function createSvg(geoJson, options) {
      if (!geoJson) throw new Error('Missing geoJson argument');
      options = options || {};
      options.onclick = options.onclick || function() { console.debug("TODO: handle click on a SVG element");};

      // Remove existing svg
      if (options.selector) {
        d3.select(options.selector + ' svg').remove();
      }
      var selector = options.selector || 'body'
      var container = d3.select(selector);
      var clientRect = container.node().getBoundingClientRect();


      // Width and height
      var w = options.width || clientRect.width || 800,
        h = options.height || clientRect.height || w;

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
        .attr("width", w)
        .attr("height", h);

      // Calculate bounding box transforms for entire collection
      var b = path.bounds( geoJson ),
        s = .95 / Math.max((b[1][0] - b[0][0]) / w, (b[1][1] - b[0][1]) / h),
        t = [(w - s * (b[1][0] + b[0][0])) / 2, (h - s * (b[1][1] + b[0][1])) / 2];

      // Update the projection
      projection
        .scale(s)
        .translate(t);

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
          return d.properties['title'] || d.properties['nom'];
        });

      return svg;
    }


    function removeSvg(options) {
      if (!options && !options.selector) throw new Error("Missing 'options.selector' argument");

      // Remove existing svg
      d3.select(options.selector + ' svg').remove();
    }

    return {
      add: raw.add,
      update: raw.update,

      // TODO : dev
      get: getShape,
      getAllCountries: getAllCountries,
      svg: {
        create: createSvg,
        remove: removeSvg
      },

      constants: constants
    }
  })

