angular.module('cesium.market.record.services', ['ngApi', 'cesium.services', 'cesium.es.services',
  'cesium.market.settings.services', 'cesium.market.category.services'])

.factory('mkRecord', function($q, csSettings, BMA, csConfig, esHttp, esComment, esGeo, csWot, csCurrency, mkSettings, mkCategory, Api) {
  'ngInject';

  var
    fields = {
      commons: ["category", "title", "description", "issuer", "time", "creationTime", "location", "address", "city", "price",
          "unit", "currency", "thumbnail._content_type", "picturesCount", "type", "stock", "fees", "feesCurrency",
          "geoPoint", "pubkey", "freePrice"]
    },
    CONSTANTS = {
      DEFAULT_SEARCH_SIZE: 20
    },
    raw = {
      postSearch: esHttp.post('/market/record/_search'),
      searchText: esHttp.get('/market/record/_search?q=:search'),
      get: esHttp.get('/market/record/:id'),
      getCommons: esHttp.get('/market/record/:id?_source=' + fields.commons.join(',')),
      add: esHttp.record.post('/market/record'),
      update: esHttp.record.post('/market/record/:id/_update'),
      remove: esHttp.record.remove('market', 'record')
    },
    api = new Api(this, "mkRecord"),
    filters = {
        localSale: {
            excludes: [
                'cat2',   // Voitures
                'cat3',   // Motos
                'cat4',   // Caravaning
                'cat5',   // Utilitaires
                'cat7',   // Nautisme
                'cat28',  // Animaux
                'cat71',  // Emploi
                'cat8',   // Immobilier
                'cat66',  // Vacances
                'cat56',  // Matériel professionnel
                'cat31',  // Services
                'cat48'   // Vins &amp; Gastronomie
            ]
        }
    };

  function readRecordFromHit(hit, categories, currentUD, options) {

    options = options || {};

    var record = hit._source;

    if (record.category && record.category.id) {
      record.category = categories[record.category.id] || record.category;
    }

    // Always convert relative price/fees into absolute price
    if (record.price && options.convertPrice && currentUD) {
      if (record.unit==='UD') {
        record.price = record.price * currentUD;
      }
    }
    if (record.fees && options.convertPrice && currentUD && (!record.feesCurrency || record.feesCurrency === record.currency)) {
      if (record.unit==='UD') {
          record.fees = record.fees * currentUD;
      }
    }
    if (options.html && hit.highlight) {
      if (hit.highlight.title) {
        record.title = hit.highlight.title[0];
      }
      if (hit.highlight.description) {
          record.description = hit.highlight.description[0];
      }
      else {
          record.description = esHttp.util.parseAsHtml(record.description, {
              tagState: 'app.market_lookup'
          });
      }
      if (hit.highlight.location) {
        record.location = hit.highlight.location[0];
      }
      if (hit.highlight.city) {
        record.city = hit.highlight.city[0];
      }
      if (record.category && hit.highlight["category.name"]) {
        record.category.name = hit.highlight["category.name"][0];
      }
    }

    else if (options.html) {
        // description
        record.description = esHttp.util.parseAsHtml(record.description, {
            tagState: 'app.market_lookup'
        });
    }

    // thumbnail
    record.thumbnail = esHttp.image.fromHit(hit, 'thumbnail');

    // pictures
    if (hit._source.pictures && hit._source.pictures.reduce) {
      record.pictures = hit._source.pictures.reduce(function(res, pic) {
        return pic && pic.file ? res.concat(esHttp.image.fromAttachment(pic.file)) : res;
      }, []);
    }

    // backward compat (before gchange v0.6)
    if (record.location && !record.city) {
        record.city = record.location;
    }

    return record;
  }


  function search(request, options) {
    request = request || {};
    request.from = request.from || 0;
    request.size = isNaN(request.size) ? CONSTANTS.DEFAULT_SEARCH_SIZE : request.size;
    request._source = request._source || fields.commons;
    request.highlight = request.highlight || {
      fields : {
        title : {},
        description : {},
        "category.name" : {},
        tags: {}
      }
    };

    var requestParams = {
      request_cache: options && options.withCache === true || false
    };

    return $q.all([
      // load categories
      mkCategory.all(),

      // Get current UD
      csCurrency.currentUD()
        .then(function (currentUD) {
          return currentUD;
        })
        .catch(function(err) {
          console.error(err);
          return 1;
        }),

      // Do search
      raw.postSearch(request, requestParams)
    ])
      .then(function(res) {
        var categories = res[0];
        var currentUD = res[1];
        res = res[2];

        if (!res || !res.hits || !res.hits.total) {
          return {
            total: 0,
            hits: []
          };
        }

        // Get the geoPoint from the 'geo_distance' filter
        var geoDistanceObj = esHttp.util.findObjectInTree(request.query, 'geo_distance');
        var geoPoint = geoDistanceObj && geoDistanceObj.geoPoint;
        var geoDistanceUnit = geoDistanceObj && geoDistanceObj.distance && geoDistanceObj.distance.replace(new RegExp("[0-9 ]+", "gm"), '');

        var hits = res.hits.hits.reduce(function(result, hit) {
          var record = readRecordFromHit(hit, categories, currentUD, {convertPrice: true, html: true});
          record.id = hit._id;

          // Add distance to point
          if (geoPoint && record.geoPoint && geoDistanceUnit) {
            record.distance = esGeo.point.distance(
              geoPoint.lat, geoPoint.lon,
              record.geoPoint.lat, record.geoPoint.lon,
              geoDistanceUnit
            );
          }

          return result.concat(record);
        }, []);

        // call extension point
        return api.record.raisePromise.search(hits)
          .then(function() {

            return {
              total: res.hits.total,
              hits: hits
            };
          });
      });
  }

  function loadData(id, options) {
    options = options || {};
    options.fetchPictures = angular.isDefined(options.fetchPictures) ? options.fetchPictures : true;
    options.convertPrice = angular.isDefined(options.convertPrice) ? options.convertPrice : false;

    var hit;
    return $q.all([
        // load categories
        mkCategory.all(),

        // Get current UD
        csCurrency.currentUD()
          .catch(function(err) {
            console.error('Could not get current UD', err);
            return 1;
          }),

        // Do get source
        options.fetchPictures ?
          raw.get({id: id}) :
          raw.getCommons({id: id})
      ])
      .then(function(res) {
        var categories = res[0];
        var currentUD = res[1];
        hit = res[2];

        var record = readRecordFromHit(hit, categories, currentUD, options);
        record.id = hit._id;

        // Fill currency with default, if need (e.g. fix old data)
        if (!record.currency && record.price) {
          return mkSettings.currencies()
            .then(function (currencies) {
              record.currency = currencies && currencies[0];
              return record;
            });
        }
        return record;
      })
      .then(function (record) {

        return $q.all([
          // Load issuer (avatar, name, etc.)
          csWot.extend({issuer: record.issuer}, "issuer", true/*skipAddUid*/),

          // API extension (e.g. See market TX service)
          api.record.raisePromise.load(record)
            .catch(function(err) {
              console.debug('[market] [record-service] Error while executing extension point on record load.');
              console.error(err);
            })
          ])
          .then(function(res) {
            var issuer = res[0];
            return {
              id: record.id,
              issuer: issuer,
              record: record
            };
          });
      });
  }

  function setStockToRecord(id, stock) {
    return raw.get({id: id})
        .then(function(res) {
            if (!res || !res._source) return;
            var record = res._source;
            record.stock = stock||0;
            record.id = id;
            return raw.update(record, {id: id});
        });
  }

  function createRequest(options) {
      options = options || {};

      var request = {
          from: options.from||0,
          size: options.size||20,
          _source: options._source || fields.commons
      };

      var matches = [];
      var filters = [];
      if (options.category) {
          filters.push({
              nested: {
                  path: "category",
                  query: {
                      bool: {
                          filter: {
                              term: { "category.id": options.category}
                          }
                      }
                  }
              }
          });
      }
      if (options.categories && options.categories.length) {
          filters.push({
              nested: {
                  path: "category",
                  query: {
                      bool: {
                          filter: {
                              terms: { "category.id": options.categories}
                          }
                      }
                  }
              }
          });
      }
      if (options.type) {
          var types = options.type === 'offer' ?
              ['offer', 'auction'] :
              (options.type === 'need' ? ['need', 'crowdfunding'] : [options.type]);
          filters.push({terms: {type: types}});
      }

      var text = (options.text || '').trim();
      var tags = text.length > 0 ? esHttp.util.parseTags(text) : undefined;
      if (text.length > 1) {

          // pubkey : use a special 'term', because of 'non indexed' field
          if (BMA.regexp.PUBKEY.test(text /*case sensitive*/)) {
              matches = [];
              filters.push({term : { issuer: text}});
          }
          else {
              var lowerText = text.toLowerCase();

              var matchFields = ["title^2", "description"];
              matches.push({multi_match : { query: lowerText,
                      fields: matchFields,
                      type: "phrase_prefix"
                  }});
              matches.push({match: {title: {query: lowerText, boost: 2}}});
              matches.push({prefix: {title: lowerText}});
              matches.push({match: {description: lowerText}});

              matches.push({
                  nested: {
                      path: "category",
                      query: {
                          bool: {
                              filter: {
                                  match: { "category.name": lowerText}
                              }
                          }
                      }
                  }
              });
          }
      }
      if (tags) {
          filters.push({terms: {tags: tags}});
      }
      if (options.withStock) {
          filters.push({range: {stock: {gt: 0}}});
      }
      if (options.withPictures) {
          filters.push({range: {picturesCount: {gt: 0}}});
      }

      if (!options.withOld) {
          var minTime = options.minTime ? options.minTime : Date.now() / 1000  - 24 * 365 * 60 * 60; // last year
          // Round to hour, to be able to use cache
          minTime = Math.floor(minTime / 60 / 60 ) * 60 * 60;
          filters.push({range: {time: {gte: minTime}}});
      }
      if (options.currencies && options.currencies.length) {
          filters.push({terms: {currency: options.currencies}});
      }

      var location = options.location && options.location.trim();
      var geoDistance = options.geoDistance || '50km';
      if (options.geoPoint && options.geoPoint.lat && options.geoPoint.lon) {

          // match location OR geo distance
          if (location && location.length) {
              var locationCity = location.toLowerCase().split(',')[0];
              filters.push({
                  or : [
                      // No position defined: search on text
                      {
                          and: [
                              {not: {exists: { field : "geoPoint" }}},
                              {multi_match: {
                                      query: locationCity,
                                      fields : [ "city^3", "location" ]
                                  }}
                          ]
                      },
                      // Has position: use spatial filter
                      {geo_distance: {
                              distance: geoDistance,
                              geoPoint: {
                                  lat: options.geoPoint.lat,
                                  lon: options.geoPoint.lon
                              }
                          }}
                  ]
              });
          }

          else {
              filters.push(
                  {geo_distance: {
                          distance: geoDistance,
                          geoPoint: {
                              lat: options.geoPoint.lat,
                              lon: options.geoPoint.lon
                          }
                      }});
          }
      }
      else if (options.geoShape && options.geoShape.geometry) {
          var coordinates = options.geoShape.geometry.coordinates;
          var type = options.geoShape.geometry.type;
          if (location && (type === 'Polygon' || type === 'MultiPolygon') && coordinates && coordinates.length) {
              // One polygon
              if (coordinates.length === 1) {
                  filters.push(
                      {
                          geo_polygon: {
                              geoPoint: {
                                  points: coordinates.length === 1 ? coordinates[0] : coordinates
                              }
                          }
                      });
              }
              // Multi polygon
              else {
                  filters.push({
                      or: coordinates.reduce(function (res, coords) {
                          return res.concat(coords.reduce(function(res, points) {
                              return res.concat({geo_polygon: {
                                      geoPoint: {
                                          points: points
                                      }
                                  }});
                          }, []));
                      }, [])
                  });
              }
          }
      }

      // Add query to request
      if (matches.length || filters.length) {
          request.query = {bool: {}};
          if (matches.length) {
              request.query.bool.should =  matches;
              // Exclude result with score=0
              request.query.bool.minimum_should_match = 1;
          }
          if (filters.length) {
              request.query.bool.filter =  filters;
          }
      }

      return request;
  }

  function searchPictures(options) {
      options = options || {};

      options._source = options._source || ["category", "title", "price", "unit", "currency", "city", "pictures", "stock", "unitbase", "description", "type", "issuer", "creationTime" ];
      options.withPictures = true;

      // Create the request, from options
      var request = createRequest(options);

      // Run the search
      return search(request)
          .then(function(res) {
              // Filter, to keep only record with pictures
              var hits = (res.hits || []).reduce(function (res, record) {
                  if (!record.pictures || !record.pictures.length) return res;

                  // Replace thumbnail with the first picture (full quality)
                  angular.merge(record, record.pictures[0]);
                  delete record.pictures;
                  delete record.thumbnail;

                  return res.concat(record);
              }, []);

              // Fetch user profile (avatar, name, etc.)
              return csWot.extendAll(hits, 'issuer', true /*skipAddUid*/)
                  .then(function() {
                      return {
                          hits: hits,
                          total: res.total
                      };
                  });
          });

  }

  function searchMoreLikeThis(id, options) {
    options = options || {};

    var size = options.size||6;
    var request = {
      from: options.from||0,
      size: size * 2,
      _source: options._source || fields.commons,
      query: {
        more_like_this : {
          fields : ["title", "category.name", "type", "city"],
          like : [
            {
              "_index" : "market",
              "_type" : "record",
              "_id" : id
            }
          ],
          "min_term_freq" : 1,
          "max_query_terms" : 12
        }
      }
    };

    if (options.type || options.category || options.city) {
      var doc = {};
      if (options.type) doc.type = options.type;
      if (options.category) doc.category = {id: options.category};
      if (options.city) doc.city = options.city;
      request.query.more_like_this.like.push(
      {
        "_index" : "market",
        "_type" : "record",
        "doc" : doc
      });
    }

    var minTime = (Date.now() / 1000) - 60 * 60 * 24 * 365; // last year
    var oldHits = [];

    var processHits = function(categories, currentUD, size, res) {
      if (!res || !res.hits || !res.hits.total) {
        return {
          total: 0,
          hits: []
        };
      }

      var hits = res.hits.hits.reduce(function(res, hit, index) {
        if (index >= size) return res; // Skip (already has enought ad)

        var record = readRecordFromHit(hit, categories, currentUD, {convertPrice: true, html: true});
        record.id = hit._id;

        // Exclude if closed
        if (record.stock === 0) return res;

        // Exclude if too old
        if ((record.time || record.creationTime) < minTime) {
          oldHits.push(record);
          return res;
        }

        return res.concat(record);
      }, []);

      if (hits.length < size) {
        var missingSize = size - hits.length;
        if (request.from < res.hits.total) {
          request.from += size;
          request.size = missingSize;
          return raw.postSearch(request)
            .then(function (more) {
              return processHits(categories, currentUD, missingSize, more);
            })
            .then(function (more) {
              return {
                total: res.hits.total,
                hits: hits.concat(more.hits || [])
              };
            });
        }
        else if (oldHits.length > 0){
          if (oldHits.length > missingSize) {
            oldHits.splice(missingSize);
          }
          hits = hits.concat(oldHits);
        }
      }

      return {
        total: res.hits.total,
        hits: hits
      };
    };

    return $q.all([
      // load categories
      mkCategory.all(),

      // Get current UD
      csCurrency.currentUD()
        .catch(function(err) {
          console.error('Could not get current UD', err);
          return 1;
        }),

      // Search request
      raw.postSearch(request)

    ])
      .then(function(res) {
        var categories = res[0];
        var currentUD = res[1];
        res = res[2];
        return processHits(categories, currentUD, size, res);
      })
      .then(function(res) {
        return csWot.extendAll(res.hits, 'issuer', true /*skipAddUid*/)
          .then(function(_) {
            return res;
          });
      });
  }

  // Register extension points
  api.registerEvent('record', 'load');
  api.registerEvent('record', 'search');

  return {
    category: mkCategory,
    record: {
      search: search,
      load: loadData,
      setStock: setStockToRecord,
      pictures: searchPictures,
      add: raw.add,
      update: raw.update,
      remove: raw.remove,
      moreLikeThis: searchMoreLikeThis,
      fields: {
        commons: fields.commons
      },
      picture: {
        all: esHttp.get('/market/record/:id?_source=pictures')
      },
      comment: esComment.instance('market'),
      like: {
        add: esHttp.like.add('market', 'record'),
        remove: esHttp.like.remove('market', 'record'),
        toggle: esHttp.like.toggle('market', 'record'),
        count: esHttp.like.count('market', 'record')
      }
    },
    // api extension
    api: api
  };
})
;
