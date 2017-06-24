angular.module('cesium.market.record.services', ['ngResource', 'cesium.services', 'cesium.es.http.services', 'cesium.es.comment.services'])

.factory('mkRecord', function($q, csSettings, BMA, csConfig, esHttp, esComment, csWot, csCurrency) {
  'ngInject';

  function EsMarket(id) {

    var
      fields = {
        commons: ["category", "title", "description", "issuer", "time", "location", "price", "unit", "currency", "thumbnail._content_type", "picturesCount", "type", "stock"]
      },
      exports = {
        id: id,
        _internal: {}
      },
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

    exports._internal.record= {
      postSearch: esHttp.post('/market/record/_search')
    };
    exports._internal.category= {
        get: esHttp.get('/market/category/:id'),
        all: esHttp.get('/market/category/_search?sort=order&size=1000&_source=name,parent'),
        search: esHttp.post('/market/category/_search')
      };


    function getCategories() {
      if (exports._internal.categories && exports._internal.categories.length) {
        var deferred = $q.defer();
        deferred.resolve(exports._internal.categories);
        return deferred.promise;
      }

      return exports._internal.category.all()
        .then(function(res) {
          if (res.hits.total === 0) {
            exports._internal.categories = [];
          }
          else {
            var categories = res.hits.hits.reduce(function(result, hit) {
              var cat = hit._source;
              cat.id = hit._id;
              return result.concat(cat);
            }, []);
            // add as map also
            _.forEach(categories, function(cat) {
              categories[cat.id] = cat;
            });
            exports._internal.categories = categories;
          }
          return exports._internal.categories;
        });
    }

    function getFilteredCategories(options) {
        options = options || {};
        options.filter = angular.isDefined(options.filter) ? options.filter : undefined;

        var cachedResult = exports._internal.filteredCategories && exports._internal.filteredCategories[options.filter];
        if (cachedResult && cachedResult.length) {
            var deferred = $q.defer();
            deferred.resolve(cachedResult);
            return deferred.promise;
        }

        // Prepare filter exclude function
        var excludes = options.filter && filters[options.filter] && filters[options.filter].excludes;
        var isExclude = excludes && function(value) {
            return _.contains(excludes, value);
        };

        return exports._internal.category.all()
            .then(function(res) {
                // no result
                if (res.hits.total === 0) return [];

                var categories = res.hits.hits.reduce(function(result, hit) {
                    var cat = hit._source;
                    cat.id = hit._id;
                    return (isExclude &&
                        ((cat.parent && isExclude(cat.parent)) || isExclude(cat.id))) ?
                        result :
                        result.concat(cat);
                }, []);

                // add as map also
                _.forEach(categories, function(cat) {
                    categories[cat.id] = cat;
                });
                exports._internal.filteredCategories = exports._internal.filteredCategories || {};
                exports._internal.filteredCategories[options.type] = categories;
                return categories;
            });
    }

    function getCategory(params) {
      return exports._internal.category.get(params)
        .then(function(hit) {
          var res = hit._source;
          res.id = hit._id;
          return res;
        });
    }

    function getCategoriesStats(options) {

        var request = {
            size: 0,
            aggs: {
                category: {
                    nested: {
                        path: 'category'
                    },
                    aggs: {
                        by_id: {
                            terms: {
                                field: 'category.id'
                            }
                        }
                    }
                }
            }
        };

        var filters = [];
        var matches = [];
        if (options.withStock) {
            filters.push({range: {stock: {gt: 0}}});
        }
        // Add query to request
        if (matches.length || filters.length) {
            request.query = {bool: {}};
            if (matches.length) {
                request.query.bool.should =  matches;
            }
            if (filters.length) {
                request.query.bool.filter =  filters;
            }
        }

      return $q.all([
          getFilteredCategories(options),
          exports._internal.record.postSearch(request)
      ]).then(function(res) {
          var categories = res[0];
          res = res[1];

          var buckets = (res.aggregations.category && res.aggregations.category.by_id && res.aggregations.category.by_id.buckets || [])
          var countById = {};
          buckets.forEach(function(bucket){
            var cat = categories[bucket.key];
            if (cat){
              countById[bucket.key] = bucket.doc_count;
              if (cat.parent) {
                countById[cat.parent] = (countById[cat.parent] || 0) + bucket.doc_count;
              }
            }
          });

          return categories.reduce(function(res, cat) {
            return res.concat(angular.merge({
              count: countById[cat.id] || 0
            }, cat))
          }, []);
        })
          .then(function(res) {

            //var parents = _.filter(res, function(cat) {return !cat.parent;});
            var catByParent = _.groupBy(res, function(cat) {return cat.parent || 'roots';});
            _.forEach(catByParent.roots, function(parent) {
                parent.children = catByParent[parent.id];
            });
            // group by parent category
            return catByParent.roots;
          })
          .catch(function(err) {
             console.error(err);
          });
    }

    function readRecordFromHit(hit, categories, currentUD, convertPriceToUnit) {

      var record = hit._source;
      if (record.category && record.category.id) {
        record.category = categories[record.category.id];
      }

      if (record.price && convertPriceToUnit) {
        if (record.unit==='UD') {
          record.price = record.price * currentUD;
        }
      }
      if (hit.highlight) {
        if (hit.highlight.title) {
          record.title = hit.highlight.title[0];
        }
        if (hit.highlight.description) {
          record.description = hit.highlight.description[0];
        }
        if (hit.highlight.location) {
          record.location = hit.highlight.location[0];
        }
        if (record.category && hit.highlight["category.name"]) {
          record.category.name = hit.highlight["category.name"][0];
        }
      }

      // thumbnail
      record.thumbnail = esHttp.image.fromHit(hit, 'thumbnail');

      // pictures
      if (hit._source.pictures && hit._source.pictures.reduce) {
        record.pictures = hit._source.pictures.reduce(function(res, pic) {
          return pic && pic.file ? res.concat(esHttp.image.fromAttachment(pic.file)) : res;
        }, []);
      }

      return record;
    }

    exports._internal.searchText = esHttp.get('/market/record/_search?q=:search');
    exports._internal.search = esHttp.post('/market/record/_search');
    exports._internal.get = esHttp.get('/market/record/:id');
    exports._internal.getCommons = esHttp.get('/market/record/:id?_source=' + fields.commons.join(','));

    function search(request) {
      request = request || {};
      request.from = request.from || 0;
      request.size = request.size || 20;
      request._source = request._source || fields.commons;
      request.highlight = request.highlight || {
        fields : {
          title : {},
          description : {},
          "category.name" : {}
        }
      };

      return $q.all([
        // load categories
        exports.category.all(),

        // Get last UD
        BMA.blockchain.lastUd()
          .then(function (currentUD) {
            return currentUD;
          })
          .catch(function(err) {
            console.error(err);
            return 1;
          }),

        // Do search
        exports._internal.search(request)
      ])
        .then(function(res) {
          var categories = res[0];
          var currentUD = res[1];
          res = res[2];

          if (!res || !res.hits || !res.hits.total) {
            return [];
          }
          return res.hits.hits.reduce(function(result, hit) {
            var record = readRecordFromHit(hit, categories, currentUD, true);
            record.id = hit._id;
            return result.concat(record);
          }, []);
        });
    }

    function loadData(id, options) {
      options = options || {};
      options.fetchPictures = angular.isDefined(options.fetchPictures) ? options.fetchPictures : true;
      options.convertPrice = angular.isDefined(options.convertPrice) ? options.convertPrice : false;

      return $q.all([
          // load categories
          exports.category.all(),

          // Get current UD
          csCurrency.currentUD()
            .catch(function(err) {
              console.error('Could not get current UD', err);
              return 1;
            }),

          // Do get source
          options.fetchPictures ?
            exports._internal.get({id: id}) :
            exports._internal.getCommons({id: id})
        ])
        .then(function(res) {
          var categories = res[0];
          var currentUD = res[1];
          var hit = res[2];

          var record = readRecordFromHit(hit, categories, currentUD, options.convertPrice);

          // Load issuer (avatar, name, uid, etc.)
          return csWot.extend({pubkey: record.issuer})
            .then(function(issuer) {
              var data = {
                id: hit._id,
                issuer: issuer,
                record: record
              };

              // Make sure currency if present (fix old data)
              if (record.price && !record.currency) {
                if (csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.defaultCurrency) {
                  record.currency = csConfig.plugins.market.defaultCurrency;
                  return data;
                }
                return csCurrency.get()
                  .then(function (currency) {
                    record.currency = currency.name;
                    return data;
                  });
              }

              return data;
            });
        });
    }

    function setStockToRecord(id, stock) {
          return exports._internal.get({id: id})
              .then(function(res) {
                  if (!res || !res._source) return;
                  var record = res._source;
                  record.stock = stock||0;
                  record.id = id;
                  return exports.record.update(record, {id: id});
              });
    }

    function searchPictures(options) {
        options = options || {};

        var request = {
            from: options.from||0,
            size: options.size||20,
            _source: options._source || ["category", "title", "price", "unit", "currency", "location", "pictures", "stock"]
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
        if (options.categories) {
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
        if (options.withStock) {
            filters.push({range: {stock: {gt: 0}}});
        }

        // Add query to request
        if (matches.length || filters.length) {
            request.query = {bool: {}};
            if (matches.length) {
                request.query.bool.should =  matches;
            }
            if (filters.length) {
                request.query.bool.filter =  filters;
            }
        }

        return exports.record.search(request)
            .then(function(res) {
                // Filter, to keep only record with pictures
                return res.reduce(function(res, record) {
                    if (!record.pictures || !record.pictures.length) return res;

                    // Replace thumbnail with the first picture (full quality)
                    angular.merge(record, record.pictures[0]);
                    delete record.pictures;
                    delete record.thumbnail;

                    return res.concat(record);
                }, []);
            });
    }

    exports.category = {
        all: getCategories,
        filtered: getFilteredCategories,
        get: getCategory,
        searchText: esHttp.get('/market/category/_search?q=:search'),
        search: esHttp.post('/market/category/_search'),
        stats: getCategoriesStats
      };
    exports.record = {
        search: search,
        load: loadData,
        setStock: setStockToRecord,
        pictures: searchPictures,
        add: esHttp.record.post('/market/record'),
        update: esHttp.record.post('/market/record/:id/_update'),
        remove: esHttp.record.remove('market', 'record'),
        fields: {
          commons: fields.commons
        },
        picture: {
          all: esHttp.get('/market/record/:id?_source=pictures')
        },
        comment: esComment.instance('market')
      };
    return exports;
  }

  return EsMarket('default');
})
;
