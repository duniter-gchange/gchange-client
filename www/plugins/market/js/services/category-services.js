angular.module('cesium.market.category.services', ['ngResource', 'cesium.services', 'cesium.es.services', 'cesium.market.settings.services'])

  .factory('mkCategory', function ($q, $translate, csSettings, BMA, csConfig, esHttp, esComment, esGeo, csWot, csCurrency, mkSettings) {
    'ngInject';

    var
      filters = {},
      regexp = {
        ID: /^cat[0-9]+$/
      },
      raw = {
        get: esHttp.get('/market/category/:id'),
        all: esHttp.get('/market/category/_search?sort=order&size=1000&_source=name,parent,localizedNames'),
        search: esHttp.post('/market/category/_search'),
        add: esHttp.record.post('/market/category', {creationTime: true}),
        update: esHttp.record.post('/market/category/:id/_update', {creationTime: true}),
        remove: esHttp.record.remove("market","category"),
        record: {
          postSearch: esHttp.post('/market/record/_search'),
        },
      },
      cache = {
        localeId: undefined
      };

    function readFromHit(hit, options) {
      var cat = hit._source;
      cat.id = hit._id;

      // Replace name by the current locale, when possible
      if (cat.localizedNames) {
        cat.name = cat.localizedNames[options.localId]
          // Fallback to default locale, or keep existing name
          || (options.fallbackLocalId && cat.localizedNames[options.fallbackLocalId])
          || cat.name;
      }

      return cat;
    }

    function getCategories(options) {
      options = options || {};
      options.withCache = angular.isDefined(options.withCache) ? options.withCache : true;
      options.localId = angular.isDefined(options.localId) ? options.localId : $translate.use();
      options.fallbackLocalId = csSettings.fixLocale(csConfig.defaultLanguage) || 'en';

      if (options.withCache && cache.categories && cache.categories.length && cache.localeId === options.localId) {
        var deferred = $q.defer();
        deferred.resolve(cache.categories);
        return deferred.promise;
      }


      return raw.all()
        .then(function (res) {
          var categories;
          if (res.hits.total === 0) {
            categories = [];
          } else {
            var categories = res.hits.hits.reduce(function (result, hit) {
              var cat = readFromHit(hit, options);
              return result.concat(cat);
            }, []);
            // add as map also
            _.forEach(categories, function (cat) {
              categories[cat.id] = cat;
            });
          }
          // Update the cache
          cache.categories = categories;
          if (cache.localeId !== options.localId) {
            cache.localeId = options.localId;
            cache.filteredCategories = undefined;
          }

          return categories;
        });
    }

    function getFilteredCategories(options) {
      options = options || {};
      options.filter = angular.isDefined(options.filter) ? options.filter : undefined;
      options.withCache = angular.isDefined(options.withCache) ? options.withCache : true;
      options.localId = angular.isDefined(options.localId) ? options.localId : $translate.use();
      options.fallbackLocalId = csSettings.fixLocale(csConfig.defaultLanguage) || 'en';

      var cachedResult = options.withCache && cache.filteredCategories && cache.filteredCategories[options.filter];
      if (cachedResult && cachedResult.length && cache.localeId === options.localId) {
        var deferred = $q.defer();
        deferred.resolve(cachedResult);
        return deferred.promise;
      }

      // Prepare filter exclude function
      var excludes = options.filter && filters[options.filter] && filters[options.filter].excludes;
      var isExclude = excludes && function (value) {
        return _.contains(excludes, value);
      };

      return raw.all()
        .then(function (res) {
          // no result
          if (res.hits.total === 0) return [];

          var categories = res.hits.hits.reduce(function (result, hit) {
            var cat = readFromHit(hit, options);
            return (isExclude &&
              ((cat.parent && isExclude(cat.parent)) || isExclude(cat.id))) ?
              result :
              result.concat(cat);
          }, []);

          // add as map also
          _.forEach(categories, function (cat) {
            categories[cat.id] = cat;
          });

          // Update cache
          cache.filteredCategories = cache.filteredCategories || {};
          cache.filteredCategories[options.type] = categories;
          if (cache.localeId !== options.localId) {
            cache.localeId = options.localId;
            cache.categories = undefined;
          }

          return categories;
        });
    }

    function getCategory(params, options) {
      options = options || {};
      options.withCache = angular.isDefined(options.withCache) ? options.withCache : true;
      options.withChildren = angular.isDefined(options.withChildren) ? options.withChildren : true;

      // If children is need, get
      if (options.withChildren || options.withCache) {
        return getCategories(options)

          .then(function(categories) {
            var cat = categories[params.id];

            // Make sure to fill tree
            if (options.withChildren) asCategoriesTree(categories);

            return cat;
          })
      }

      return raw.get(params)
        .then(function (hit) {
          var res = readFromHit(hit);

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

      options.asTree = angular.isDefined(options.asTree) ? options.asTree : true;

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
        var minTime = options.minTime ? options.minTime : Date.now() / 1000 - 24 * 365 * 60 * 60; // last year
        // Round to hour, to be able to use cache
        minTime = Math.floor(minTime / 60 / 60) * 60 * 60;
        filters.push({range: {time: {gte: minTime}}});
      }
      if (options.currencies && options.currencies.length) {
        filters.push({terms: {currency: options.currencies}});
      }
      // Add query to request
      if (matches.length || filters.length) {
        request.query = {bool: {}};
        if (matches.length) {
          request.query.bool.should = matches;
        }
        if (filters.length) {
          request.query.bool.filter = filters;
        }
      }
      var statsRequestParams = {
        request_cache: true // Always enable stats cache
      };

      return $q.all([
        getFilteredCategories(options),
        raw.record.postSearch(request, statsRequestParams)
      ]).then(function (res) {
        var categories = res[0];
        res = res[1];

        // Add stats
        var buckets = (res.aggregations.category && res.aggregations.category.by_id && res.aggregations.category.by_id.buckets || []);
        var countById = {};
        buckets.forEach(function (bucket) {
          var cat = categories[bucket.key];
          if (cat) {
            countById[bucket.key] = bucket.doc_count;
            if (cat.parent) {
              countById[cat.parent] = (countById[cat.parent] || 0) + bucket.doc_count;
            }
          }
        });

        return categories.reduce(function (res, cat) {
          return res.concat(angular.merge({
            count: countById[cat.id] || 0
          }, cat));
        }, []);
      })
        // Convert to root categories
        .then(function (res) {
          return options.asTree ? asCategoriesTree(res) : res;
        })
        // Handle error
        .catch(function (err) {
          console.error(err);
          return undefined;
        });
    }

    function addCategory(category) {
      console.debug('[market] [category] Adding category', category);
      return raw.add(category);
    }

    function updateCategory(category) {
      console.debug('[market] [category] Updating category', category);
      return raw.update(category, {id: category.id});
    }

    function removeCategoryById(id) {
      console.debug('[market] [category] Removing category: ' + id);
      return raw.remove(id);
    }

    function asCategoriesTree(categories) {
      var catByParent = _.groupBy(categories, function (cat) {
        return cat.parent || 'roots';
      });
      _.forEach(catByParent.roots, function (parent) {
        parent.children = catByParent[parent.id];
      });
      // group by parent category
      return catByParent.roots;
    }

    function saveAllCategories(cats, options) {

      options = options || {};

      if (!options.parent) {
        var now = Date.now();
        console.debug('[market] [category] Saving all categories...', cats);
      }

      // Avoid to reload categories, when processing children categories
      var existingPromise = options.existingCategories ? $q.when(options.existingCategories) :
        getCategories(false/*no cache*/);

      var idsToDelete;

      // Get all existing (from pod, without cache)
      return existingPromise
        .then(function (existingCategories) {
          // Collect all ids (once), to be able to apply deletion, later
          idsToDelete = options.idsToDelete || _.pluck(existingCategories, 'id');

          return $q.all(_.map(cats || [], function (cat) {
            var existingCat = existingCategories[cat.id];

            // Remove the id, from the delete list
            idsToDelete = _.without(idsToDelete, cat.id);

            var isNew = !existingCat;
            console.debug("[market] [category] - {0} {1}".format(isNew ? 'Add' : 'Update', cat.id));

            // Prepare a fresh record, to save
            var record = {
              id: cat.id,
              localizedNames: cat.localizedNames
            };
            if (cat.parent) record.parent = cat.parent;
            if (existingCat && existingCat.name) record.name = cat.name || null;

            // Send save request
            var savePromise = isNew ? addCategory(record, {id: cat.id}) : updateCategory(record, {id: cat.id});

            // save children (if any), AFTER the current parent
            return (cat.children && cat.children.length) ? savePromise
              .then(function () {
                return saveAllCategories(cat.children, {parent: cat, existingCategories: existingCategories, idsToDelete: idsToDelete});
              }) : savePromise;
          }, []));
        })
        // Delete (if any)
        .then(function () {
          if (!options.parent && idsToDelete.length > 0) {
            console.debug("[market] [category] Deleting categories with id:", idsToDelete);
            return $q.all(_.map(idsToDelete, raw.remove));
          }
        })
        .then(function () {
          if (!options.parent) {
            console.debug("[market] [category] Saved in {0}ms".format(Date.now() - now));
          }
        });
    }

    return {
      all: getCategories,
      filtered: getFilteredCategories,
      asTree: asCategoriesTree,
      get: getCategory,
      searchText: esHttp.get('/market/category/_search?q=:search'),
      search: esHttp.post('/market/category/_search'),
      stats: getCategoriesStats,
      add: addCategory,
      update: updateCategory,
      remove: removeCategoryById,
      saveAll: saveAllCategories,
      regexp: regexp
    };
  })
;
