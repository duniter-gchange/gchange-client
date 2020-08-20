angular.module('cesium.market.category.services', ['ngResource', 'cesium.services', 'cesium.es.services', 'cesium.market.settings.services'])

.factory('mkCategory', function($q, csSettings, BMA, csConfig, esHttp, esComment, esGeo, csWot, csCurrency, mkSettings) {
  'ngInject';

  var
    filters = {},
    raw = {
      get: esHttp.get('/market/category/:id'),
      all: esHttp.get('/market/category/_search?sort=order&size=1000&_source=name,parent'),
      search: esHttp.post('/market/category/_search'),
      record: {
        postSearch: esHttp.post('/market/record/_search'),
      }
    },
    cache = {};

  function getCategories() {
    if (cache.categories && cache.categories.length) {
      var deferred = $q.defer();
      deferred.resolve(cache.categories);
      return deferred.promise;
    }

    return raw.all()
      .then(function(res) {
        if (res.hits.total === 0) {
          cache.categories = [];
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
          cache.categories = categories;
        }
        return cache.categories;
      });
  }

  function getFilteredCategories(options) {
      options = options || {};
      options.filter = angular.isDefined(options.filter) ? options.filter : undefined;

      var cachedResult = cache.filteredCategories && cache.filteredCategories[options.filter];
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

      return raw.all()
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
          cache.filteredCategories = cache.filteredCategories || {};
          cache.filteredCategories[options.type] = categories;
          return categories;
        });
  }

  function getCategory(params) {
    return raw.get(params)
      .then(function(hit) {
        var res = hit._source;
        res.id = hit._id;
        return res;
      });
  }

  function getCategoriesStats(options) {
      options = options || {};

      // Make sure to have currency
      if (!options.currencies) {
          return mkSettings.currencies()
              .then(function (currencies) {
                  options.currencies = currencies;
                  return getCategoriesStats(options); // loop
              });
      }


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
                              field: 'category.id',
                              size: 1000
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
      if (!options.withOld) {
        var minTime = options.minTime ? options.minTime : Date.now() / 1000  - 24 * 365 * 60 * 60; // last year
        // Round to hour, to be able to use cache
        minTime = Math.floor(minTime / 60 / 60 ) * 60 * 60;
        filters.push({range: {time: {gte: minTime}}});
      }
      if (options.currencies && options.currencies.length) {
          filters.push({terms: {currency: options.currencies}});
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
      var params = {
          request_cache: angular.isDefined(options.cache) ? options.cache : true // enable by default
      };

    return $q.all([
        getFilteredCategories(options),
        raw.record.postSearch(request, params)
    ]).then(function(res) {
        var categories = res[0];
        res = res[1];

        var buckets = (res.aggregations.category && res.aggregations.category.by_id && res.aggregations.category.by_id.buckets || []);
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
          }, cat));
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

  exports = {
    all: getCategories,
    filtered: getFilteredCategories,
    get: getCategory,
    searchText: esHttp.get('/market/category/_search?q=:search'),
    search: esHttp.post('/market/category/_search'),
    stats: getCategoriesStats
  };
  return exports;
})
;
