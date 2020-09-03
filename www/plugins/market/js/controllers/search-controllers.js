angular.module('cesium.market.search.controllers', ['cesium.market.record.services', 'cesium.es.services', 'cesium.map.services', 'cesium.es.common.controllers'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

    .state('app.market_lookup', {
      url: "/market?q&category&shape&location&reload&type&hash&lat&lon&last&old",
      views: {
        'menuContent': {
          templateUrl: "plugins/market/templates/search/lookup.html",
          controller: 'MkLookupCtrl'
        }
      },
      data: {
        large: 'app.market_lookup_lg',
        silentLocationChange: true
      }
    })

    .state('app.market_lookup_lg', {
      url: "/market/lg?q&category&shape&location&reload&type&hash&closed&lat&lon&last&old",
      views: {
        'menuContent': {
          templateUrl: "plugins/market/templates/search/lookup_lg.html",
          controller: 'MkLookupCtrl'
        }
      },
      data: {
        silentLocationChange: true
      }
    })
  })

 .controller('MkLookupAbstractCtrl', MkLookupAbstractController)

 .controller('MkLookupCtrl', MkLookupController)

;

function MkLookupAbstractController($scope, $state, $filter, $q, $location, $translate, $controller, $timeout,
                                    UIUtils, ModalUtils, csConfig, csSettings, BMA, esProfile, esHttp,
                                    mkCategory, mkRecord, mkSettings) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESLookupPositionCtrl', {$scope: $scope}));

  var defaultSearchLimit = 10;

  $scope.search = {
    text: '',
    type: null,
    lastRecords: true,
    results: [],
    loading: true,
    category: null,
    location: null,
    geoPoint: null,
    geoShape: null,
    options: null,
    loadingMore: false,
    showClosed: false,
    showOld: false,
    geoDistance: !isNaN(csSettings.data.plugins.es.geoDistance) ? csSettings.data.plugins.es.geoDistance : 20,
    sortAttribute: null,
    sortDirection: 'desc'
  };

  // Screen options
  $scope.options = $scope.options || angular.merge({
      type: {
        show: true
      },
      category: {
        show: true
      },
      description: {
        show: true
      },
      location: {
        show: true,
        prefix : undefined
      },
      fees: {
        show: true
      }
    }, csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.record || {});

  $scope.$watch('search.showClosed', function() {
    $scope.options.showClosed = $scope.search.showClosed;
  }, true);
  $scope.$watch('search.showOld', function() {
    $scope.options.showOld = $scope.search.showOld;
  }, true);

  $scope.init = function() {
    return $q.all([
        // Init currency
        mkSettings.currencies()
          .then(function(currencies) {
            $scope.currencies = currencies;
        }),
        // Resolve distance unit
        $translate('LOCATION.DISTANCE_UNIT')
          .then(function(unit) {
            $scope.geoUnit = unit;
          })
       ])
      .then(function() {
        $timeout(function() {
          // Set Ink
          UIUtils.ink({selector: '.item'});
          //$scope.showHelpTip();
        }, 200);
      });
  };

  $scope.toggleAdType = function(type) {
    if (type === $scope.search.type) {
      $scope.search.type = undefined;
    }
    else {
      $scope.search.type = type;
    }
    if ($scope.search.lastRecords) {
      $scope.doGetLastRecords();
    }
    else {
      $scope.doSearch();
    }
  };

  $scope.doSearch = function(from) {
    $scope.search.loading = !from;
    $scope.search.lastRecords = false;
    if (!$scope.search.advanced) {
      $scope.search.advanced = false;
    }

    // When a location has been set, but NOT position found: resolve position
    if ($scope.search.location && !$scope.search.geoPoint && !$scope.search.geoShape) {
      return $scope.searchPosition($scope.search.location)
        .then(function(res) {
          if (!res) {
            $scope.search.loading = false;
            return UIUtils.alert.error('MARKET.ERROR.GEO_LOCATION_NOT_FOUND');
          }
          //console.debug('[market] search by location results:', res);
          $scope.search.geoPoint = res;
          $scope.search.location = res.name && res.name.split(',')[0] || $scope.search.location;
          return $scope.doSearch(from); // Loop
        });
    }

    var text = $scope.search.text.trim();
    var matches = [];
    var filters = [];
    var stateParams = {};
    var tags = text ? esHttp.util.parseTags(text) : undefined;
    if (text.length > 1) {
      stateParams.q = text;

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

    if ($scope.search.category && $scope.search.category.id) {
      var childrenIds = $scope.search.category.children && _.pluck($scope.search.category.children, 'id');
      if (childrenIds && childrenIds.length) {
        filters.push({
          nested: {
            path: "category",
            query: {
              bool: {
                filter: {
                  terms: {"category.id": childrenIds}
                }
              }
            }
          }
        });
      }
      else {
        filters.push({
          nested: {
            path: "category",
            query: {
              bool: {
                filter: {
                  term: {"category.id": $scope.search.category.id}
                }
              }
            }
          }
        });
      }
      stateParams.category = $scope.search.category.id;
    }

    if (tags) {
      filters.push({terms: {tags: tags}});
    }

    if (!matches.length && !filters.length) {
      return $scope.doGetLastRecords();
    }



    var location = $scope.search.location && $scope.search.location.trim();
    if ($scope.search.geoPoint && $scope.search.geoPoint.lat && $scope.search.geoPoint.lon) {

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
              distance: $scope.search.geoDistance + $scope.geoUnit,
              geoPoint: {
                lat: $scope.search.geoPoint.lat,
                lon: $scope.search.geoPoint.lon
              }
            }}
          ]
        });
        stateParams.location = location;
      }

      else {
        filters.push(
          {geo_distance: {
            distance: $scope.search.geoDistance + $scope.geoUnit,
            geoPoint: {
              lat: $scope.search.geoPoint.lat,
              lon: $scope.search.geoPoint.lon
            }
          }});
      }
      stateParams.lat=$scope.search.geoPoint.lat;
      stateParams.lon=$scope.search.geoPoint.lon;
      stateParams.location = location;
    }
    else if ($scope.search.geoShape && $scope.search.geoShape.geometry) {
      var coordinates = $scope.search.geoShape.geometry.coordinates;
      var type = $scope.search.geoShape.geometry.type;
      if (location
        && (type === 'Polygon' || type === 'MultiPolygon')
        && coordinates && coordinates.length) {
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
              }, []))
            }, [])
          });
        }

        stateParams.shape = $scope.search.geoShape.id;
        stateParams.location = location;
      }
    }

    if ($scope.search.showClosed) {
      stateParams.closed = true;
    }
    else {
      filters.push({range: {stock: {gt: 0}}});
    }

    if ($scope.search.showOld) {
      stateParams.old = true;
    }
    else {
      var minTime = (Date.now() / 1000) - 60 * 60 * 24 * 365;
      filters.push({range: {time: {gt: minTime}}});
    }

    if ($scope.search.type) {
      var types = $scope.search.type === 'offer' ?
        ['offer', 'auction'] :
        ($scope.search.type === 'need' ? ['need', 'crowdfunding'] : [$scope.search.type]);
      filters.push({terms: {type: types}});
      stateParams.type = $scope.search.type;
    }

    // filter on currency
    if ($scope.currencies) {
      filters.push({terms: {currency: $scope.currencies}});
    }

    var query = {bool: {}};
    if (matches.length > 0) {
      query.bool.should = matches;
      // Exclude result with score=0
      query.bool.minimum_should_match = 1;
    }
    if (filters.length > 0) {
      query.bool.filter = filters;
    }

    // Update location href
    if (!from) {
      $location.search(stateParams).replace();
    }

    var request = {query: query, from: from};

    if ($scope.search.sortAttribute) {
      request.sort = request.sort || {};
      request.sort[$scope.search.sortAttribute] = $scope.search.sortDirection === "asc" ? "asc" : "desc";
    }

    return $scope.doRequest(request);
  };

  $scope.doGetLastRecords = function(from) {

    $scope.hideActionsPopover();
    $scope.search.lastRecords = true;

    var request = {
      sort: {
        "creationTime" : "desc"
      },
      from: from
    };

    var filters = [];
    var matches = [];

    // Filter on NOT closed
    if (!$scope.search.showClosed) {
      filters.push({range: {stock: {gt: 0}}});
    }

    // Filter on NOT too old
    if (!$scope.search.showOld) {
      var minTime = (Date.now() / 1000) - 60 * 60 * 24 * 365;
      filters.push({range: {time: {gt: minTime}}});
    }
    // filter on type
    if ($scope.search.type) {
      var types = $scope.search.type === 'offer' ?
        ['offer', 'auction'] :
        ($scope.search.type === 'need' ? ['need', 'crowdfunding'] : [$scope.search.type]);
      filters.push({terms: {type: types}});
    }
    // filter on currencies
    if ($scope.currencies) {
      filters.push({terms: {currency: $scope.currencies}});
    }
    // Category
    if ($scope.search.category && $scope.search.category.id) {
      var childrenIds = $scope.search.category.children && _.pluck($scope.search.category.children, 'id');
      if (childrenIds && childrenIds.length) {
        filters.push({
          nested: {
            path: "category",
            query: {
              bool: {
                filter: {
                  terms: {"category.id": childrenIds}
                }
              }
            }
          }
        });
      }

      else {
        filters.push({
          nested: {
            path: "category",
            query: {
              bool: {
                filter: {
                  term: { "category.id": $scope.search.category.id}
                }
              }
            }
          }
        });
      }
    }

    var location = $scope.search.location && $scope.search.location.trim().toLowerCase();
    if ($scope.search.geoPoint && $scope.search.geoPoint.lat && $scope.search.geoPoint.lon) {

      // match location OR geo distance
      if (location && location.length) {
        var locationCity = location.split(',')[0];
        filters.push({
          or : [
            // No position defined
            {
              and: [
                {not: {exists: { field : "geoPoint" }}},
                {multi_match: {
                  query: locationCity,
                  fields : [ "city^3", "location" ]
                }}
              ]
            },
            // Has position
            {geo_distance: {
              distance: $scope.search.geoDistance + $scope.geoUnit,
              geoPoint: {
                lat: $scope.search.geoPoint.lat,
                lon: $scope.search.geoPoint.lon
              }
            }}
          ]
        });
      }

      // match geo distance
      else {
        filters.push(
            {geo_distance: {
              distance: $scope.search.geoDistance + $scope.geoUnit,
              geoPoint: {
                lat: $scope.search.geoPoint.lat,
                lon: $scope.search.geoPoint.lon
              }
            }});
      }
    }
    else if ($scope.search.geoShape && $scope.search.geoShape.geometry) {
      var coordinates = $scope.search.geoShape.geometry.coordinates;
      var type = $scope.search.geoShape.geometry.type;
      if (location
        && (type === 'Polygon' || type === 'MultiPolygon')
        && coordinates && coordinates.length) {
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
                }, []))
              }, [])
            });
        }
      }
    }

    if (matches.length) {
      request.query = {bool: {}};
      request.query.bool.should =  matches;
      request.query.bool.minimum_should_match = 1;
    }
    if (filters.length) {
      request.query = request.query || {bool: {}};
      request.query.bool.filter =  filters;
    }

    // Update location href
    if (!from) {
      $location.search({
        last: true,
        type: $scope.search.type,
        category: $scope.search.category && $scope.search.category.id,
        shape: $scope.search.geoShape && ($scope.search.geoShape.id || $scope.search.geoShape.properties && $scope.search.geoShape.properties.id),
        location: $scope.search.location,
        lat: $scope.search.geoPoint && $scope.search.geoPoint.lat,
        lon: $scope.search.geoPoint && $scope.search.geoPoint.lon
      }).replace();
    }

    return $scope.doRequest(request, {withCache: true});
  };

  $scope.doRefresh = function() {
    var searchFunction = ($scope.search.lastRecords) ?
        $scope.doGetLastRecords :
        $scope.doSearch;
    return searchFunction();
  };

  $scope.showMore = function() {
    var from = $scope.search.results ? $scope.search.results.length : 0;

    $scope.search.loadingMore = true;

    var searchFunction = ($scope.search.lastRecords) ?
      $scope.doGetLastRecords :
      $scope.doSearch;

    return searchFunction(from)
      .then(function() {
        $scope.search.loadingMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      })
      .catch(function(err) {
        console.error(err);
        $scope.search.loadingMore = false;
        $scope.search.hasMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };

  $scope.doRequest = function(request, options) {
    request = request || {};
    request.from = request.from || 0;
    request.size = request.size || defaultSearchLimit;
    if (request.size < defaultSearchLimit) request.size = defaultSearchLimit;
    $scope.search.loading = (request.from === 0);

    return  mkRecord.record.search(request, options)
    .then(function(res) {

      if (!res || !res.hits || !res.hits.length) {
        $scope.search.results = (request.from > 0) ? $scope.search.results : [];
        $scope.search.total = (request.from > 0) ? $scope.search.total : 0;
        $scope.search.hasMore = false;
        return;
      }

      // Filter on type (workaround if filter on term 'type' not working)
      var formatSlug = $filter('formatSlug');
      _.forEach(res.hits, function(record) {
        // Compute title for url
        record.urlTitle = formatSlug(record.title);
      });

      // Load avatar and name
      return esProfile.fillAvatars(res.hits, 'issuer')
        .then(function(hits) {
          // Replace results, or concat if offset
          if (!request.from) {
            $scope.search.results = hits;
            $scope.search.total = res.total;
          }
          else {
            $scope.search.results = $scope.search.results.concat(hits);
          }
          $scope.search.hasMore = $scope.search.results.length < $scope.search.total;
        });
    })
    .then(function() {

      $scope.search.loading = false;

      // motion
      if ($scope.search.total > 0) $scope.motion.show();
    })
    .catch(function(err) {
      $scope.search.loading = false;
      $scope.search.results = (request.from > 0) ? $scope.search.results : [];
      $scope.search.total = (request.from > 0) ? $scope.search.total : 0;
      $scope.search.hasMore = false;
      UIUtils.onError('MARKET.ERROR.LOOKUP_RECORDS_FAILED')(err);
    });
  };

  /* -- modals -- */

  $scope.showCategoryModal = function() {
    // load categories
    return mkCategory.all()
      .then(function(categories){
        return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
          {categories : categories},
          {focusFirstInput: true}
        );
      })
      .then(function(cat){
        if (cat && cat.parent) {
          $scope.search.category = cat;
          $scope.doSearch();
        }
      });
  };

  $scope.showNewRecordModal = function() {
    return $scope.loadWallet({minData: true})
      .then(function() {
        return UIUtils.loading.hide();
      }).then(function() {
        if (!$scope.options.type.show && $scope.options.type.default) {
          return $scope.options.type.default;
        }
        return ModalUtils.show('plugins/market/templates/record/modal_record_type.html');
      })
      .then(function(type){
        if (type) {
          $state.go('app.market_add_record', {type: type});
        }
      });
  };

  $scope.showRecord = function(event, index) {
    if (event.defaultPrevented) return;
    var item = $scope.search.results[index];
    if (item) {
      $state.go('app.market_view_record', {
        id: item.id,
        title: item.title
      });
    }
  };

}


function MkLookupController($scope, $rootScope, $controller, $focus, $timeout, $ionicPopover, $translate, $q,
                            mkCategory, mkRecord, csSettings, esShape) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('MkLookupAbstractCtrl', {$scope: $scope}));


  $scope.enter = function(e, state) {
    if (!$scope.entered || !$scope.search.results || $scope.search.results.length === 0) {
      var showAdvanced = false;
      var jobs = [];

      if (state.stateParams) {
        // Search by text
        if (state.stateParams.q) { // Query parameter
          $scope.search.text = state.stateParams.q;
          $scope.search.lastRecords = false;
        }
        else if (state.stateParams.last){
          $scope.search.lastRecords = true;
        }

        // Search on type
        if (state.stateParams.type) {
          $scope.search.type = state.stateParams.type;
        }

        // Search on location
        if (state.stateParams.location) {
          $scope.search.location = state.stateParams.location;
        }

        // Geo point
        if (state.stateParams.lat && state.stateParams.lon) {
          $scope.search.geoPoint = {
            lat: parseFloat(state.stateParams.lat),
            lon: parseFloat(state.stateParams.lon)
          };
        }
        else if (state.stateParams.shape) {
          // Resolve shape
          jobs.push(esShape.get(state.stateParams.shape)
            .then(function(shape) {
              // Store in scope
              $scope.search.geoShape = shape;
            }));
        }
        else {
          var defaultSearch = csSettings.data.plugins.es.market && csSettings.data.plugins.es.market.defaultSearch;
          // Apply defaults from settings
          if (defaultSearch && defaultSearch.location) {
            angular.merge($scope.search, defaultSearch);
          }
        }

        // Search on hash tag
        if (state.stateParams.hash) {
          if ($scope.search.text) {
            $scope.search.text = '#' + state.stateParams.hash + ' ' + $scope.search.text;
          }
          else {
            $scope.search.text = '#' + state.stateParams.hash;
          }
        }

        // Show closed ads
        if (angular.isDefined(state.stateParams.closed)) {
          $scope.search.showClosed = true;
          showAdvanced = true;
        }

        // Show old ads
        if (angular.isDefined(state.stateParams.old)) {
          $scope.search.showOld = true;
          showAdvanced = true;
        }
      }

      // Search on category
      var category = state.stateParams && (state.stateParams.category || state.stateParams.cat);
      if (category) {
        var categoryName;
        var catParts = category.split(':');
        if (catParts.length > 1) {
          category = catParts[0];
          categoryName = catParts[1];
        }

        // Resolve the category
        jobs.push(mkCategory.get({id: category})
          .catch(function(err){
            // category is not in the pod: log and continue
            console.error(err && err.message || err);
            return {
              id: category,
              name: categoryName || category
            };
          })
          .then(function (cat) {
            $scope.search.category = cat;
          })
        )
      }
      // Wait all jobs are finished, before calling init() and finishEnter()
      return (jobs.length ? $q.all(jobs) : $q.when())
        .then($scope.init)
        .then(function() {
          return $scope.finishEnter(showAdvanced);
        });
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.finishEnter = function(isAdvanced) {
    $scope.search.advanced = isAdvanced ? true : $scope.search.advanced; // keep null if first call
    if (!$scope.search.lastRecords) {
      $scope.doSearch()
          .then(function() {
            $scope.showFab('fab-add-market-record');
          });
    }
    else { // By default : get last records
      $scope.doGetLastRecords()
          .then(function() {
            $scope.showFab('fab-add-market-record');
          });
    }
    // removeIf(device)
    // Focus on search text (only if NOT device, to avoid keyboard opening)
    $focus('marketSearchText');

    // endRemoveIf(device)
    $scope.entered = true;
  };

  // Store some search options as settings defaults
  $scope.updateSettings = function() {
    var dirty = false;

    csSettings.data.plugins.es.market = csSettings.data.plugins.es.market || {};
    csSettings.data.plugins.es.market.defaultSearch = csSettings.data.plugins.es.market.defaultSearch || {};

    // Check if location changed
    var location = $scope.search.location && $scope.search.location.trim();
    var oldLocation = csSettings.data.plugins.es.market.defaultSearch.location;
    if (!oldLocation || (oldLocation !== location)) {
      csSettings.data.plugins.es.market.defaultSearch = {
        location: location,
        geoPoint: location && $scope.search.geoPoint ? angular.copy($scope.search.geoPoint) : undefined
      };
      dirty = true;
    }

    // Check if distance changed
    var odlDistance = csSettings.data.plugins.es.geoDistance;
    if (!odlDistance || odlDistance !== $scope.search.geoDistance) {
      csSettings.data.plugins.es.geoDistance = $scope.search.geoDistance;
      dirty = true;
    }

    // execute with a delay, for better UI perf
    if (dirty) {
      $timeout(function() {
        csSettings.store();
      });
    }
  };

  // Store some search options as settings defaults
  $scope.leave = function() {
    $scope.updateSettings();
  };
  $scope.$on('$ionicView.leave', function() {
    // WARN: do not set by reference
    // because it can be overrided by sub controller
    return $scope.leave();
  });

  /* -- manage events -- */

  $scope.onGeoPointChanged = function() {
    if ($scope.search.loading) return;

    if ($scope.search.geoPoint && $scope.search.geoPoint.lat && $scope.search.geoPoint.lon && !$scope.search.geoPoint.exact) {
      $scope.doSearch();
    }
  };
  $scope.$watch('search.geoPoint', $scope.onGeoPointChanged, true);

  $scope.onLocationChanged = function() {
    if ($scope.search.loading) return;

    if (!$scope.search.location) {
      $scope.removeLocation();
    }
  };
  $scope.$watch('search.location', $scope.onLocationChanged, true);

  $scope.onToggleShowClosedAdChanged = function(value) {
    if ($scope.search.loading || !$scope.entered) return;

    // Refresh results
    $scope.doRefresh();
  };
  $scope.$watch('search.showClosed', $scope.onToggleShowClosedAdChanged, true);

  $scope.onGeoDistanceChanged = function() {
    if ($scope.search.loading || !$scope.entered) return;

    if ($scope.search.location) {
      // Refresh results
      $scope.doRefresh();
    }
  };
  $scope.$watch('search.geoDistance', $scope.onGeoDistanceChanged, true);

  $scope.onCategoryClick = function(cat) {
    if (!cat) return; // Skip
    $scope.search.category = cat;
    $scope.options.category.show = true;
    $scope.search.showCategories=false; // hide categories
    $scope.doSearch();
  };

  $scope.removeCategory = function() {
    $scope.search.category = null;
    $scope.category = null;
    $scope.doSearch();
  };

  $scope.removeLocation = function() {
    $scope.search.location = null;
    $scope.search.geoPoint = null;
    $scope.search.geoShape = null;
    $scope.updateSettings();
    $scope.doSearch();
  };

  /* -- modals & popover -- */

  $scope.showActionsPopover = function (event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/market/templates/search/lookup_actions_popover.html', {
        scope: $scope
      }).then(function (popover) {
        $scope.actionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function () {
          $scope.actionsPopover.remove();
        });
        $scope.actionsPopover.show(event);
      });
    }
    else {
      $scope.actionsPopover.show(event);
    }
  };

  $scope.hideActionsPopover = function () {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

  $scope.toggleShowClosed = function() {
    $scope.hideActionsPopover();
    $scope.search.showClosed = !$scope.search.showClosed;
  };
}
