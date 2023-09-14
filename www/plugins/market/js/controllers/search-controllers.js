
angular.module('cesium.market.search.controllers', ['cesium.market.record.services', 'cesium.es.services', 'cesium.map.services', 'cesium.es.common.controllers'])

  .config(function($stateProvider) {
    'ngInject';

    var queryParams = ['q', 'category', 'shape', 'location', 'reload', 'type', 'hash', 'closed', 'lat', 'lon', 'last', 'old', 'dist', 'shipping']
        .join('&');

    $stateProvider

      .state('app.market_lookup', {
        url: "/market?" + queryParams,
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
        url: "/market/lg?" + queryParams,
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

      .state('app.crowdfunding_lookup', {
        url: "/crowdfunding?" + queryParams,
        views: {
          'menuContent': {
            templateUrl: "plugins/market/templates/search/lookup.html",
            controller: 'MkCrowdfundingLookupCtrl'
          }
        },
        data: {
          large: 'app.crowdfunding_lookup_lg',
          silentLocationChange: true
        }
      })

      .state('app.crowdfunding_lookup_lg', {
        url: "/crowdfunding/lg?" + queryParams,
        views: {
          'menuContent': {
            templateUrl: "plugins/market/templates/search/lookup_lg.html",
            controller: 'MkCrowdfundingLookupCtrl'
          }
        },
        data: {
          silentLocationChange: true
        }
      });
  })

 .controller('MkLookupAbstractCtrl', MkLookupAbstractController)

 .controller('MkLookupCtrl', MkLookupController)

 .controller('MkCrowdfundingLookupCtrl', MkCrowdfundingLookupController)

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
    types: ['offer', 'need', 'auction'],
    lastRecords: true,
    size: defaultSearchLimit,
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
    shipping: null,
    // 50km by default
    geoDistance: !isNaN(csSettings.data.plugins.es.geoDistance) ? csSettings.data.plugins.es.geoDistance : 50,
    sortAttribute: null,
    sortDirection: 'desc',
    compactMode: csSettings.data.plugins.market && csSettings.data.plugins.market.compactMode,
    filterCriteriaCount: 0
  };

  // Screen options
  $scope.options = $scope.options || angular.merge({
      title: 'MARKET.SEARCH.TITLE',
      searchTextHelp: 'MARKET.SEARCH.SEARCH_HELP',
      type: {
        show: true,
        excluded: ['crowdfunding']
      },
      category: {
        show: true,
        withOld: false,
        withStock: true
      },
      description: {
        show: !$scope.search.compactMode
      },
      location: {
        show: true,
        prefix : undefined
      },
      fees: {
        show: true
      },
      filter: {
        lastRecords: false,
        showShipping: true
      }
    }, csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.record || {});

  $scope.$watch('search.type+search.showOld+search.showClosed+search.shipping', function() {
    if (!$scope.search.loading && $scope.entered) $scope.doRefresh(); // Refresh results
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
            $scope.geoUnit = unit !== 'LOCATION.DISTANCE_UNIT' ? unit : 'km';
          })
       ])
      .then(function() {
        $timeout(function() {
          // Set Ink
          UIUtils.ink({selector: '.item'});
          //$scope.showHelpTip();

          // Hide if loading (e.g. when close a ad)
          UIUtils.loading.hide(10);
        }, 200);
      });
  };

  $scope.toggleAdType = function(type) {
    $scope.hideActionsPopover();
    if (type === $scope.search.type) {
      $scope.search.type = undefined;
    }
    else {
      $scope.search.type = type;
    }
  };

  $scope.doSearch = function(from, options) {
    from = from || 0;
    options = options || {withCache: true};
    $scope.search.loading = !from;
    if (!$scope.search.advanced) {
      $scope.search.advanced = false;
    }
    $scope.search.sortAttribute = $scope.search.sortAttribute || 'creationTime';
    $scope.search.sortDirection = $scope.search.sortDirection || ($scope.search.sortAttribute === 'creationTime' ? 'desc' : 'asc');
    $scope.search.filterCriteriaCount = ($scope.search.type ? 1 : 0)
      + ($scope.search.showOld ? 1 : 0)
      + ($scope.search.showClosed ? 1 : 0)
      + ($scope.search.shipping !== null ? 1 : 0);

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
          return $scope.doSearch(from, options); // Loop
        });
    }

    var text = $scope.search.text && $scope.search.text.trim();
    $scope.search.lastRecords = !text || text.length === 0;

    // Update location href
    if (!from) {
      var tags = text ? esHttp.util.parseTags(text) : undefined;
      var hash = tags && tags.join(' ');
      _.forEach(tags||[], function(tag) {
        text = text.replace('#' + tag, '').trim();
      });

      $scope.updateLocationHref({
        q: text || undefined,
        hash: hash,
        last: $scope.search.lastRecords ? true : undefined,
        category: $scope.search.category && $scope.search.category.id || undefined,
        type: $scope.options.type.show ? $scope.search.type : undefined,
        // Location
        location: $scope.search.location && $scope.search.location.trim() || undefined,
        lat: $scope.search.geoPoint && $scope.search.geoPoint.lat,
        lon: $scope.search.geoPoint && $scope.search.geoPoint.lon,
        dist: $scope.search.geoPoint && $scope.search.geoPoint.lat && $scope.search.geoDistance || undefined,
        shape: $scope.search.geoShape && ($scope.search.geoShape.id || $scope.search.geoShape.properties && $scope.search.geoShape.properties.id),
        // Advanced options
        old: $scope.search.showOld ? true : undefined,
        closed: $scope.search.showClosed ? true : undefined,
        shipping: $scope.search.shipping ? true : undefined
      });
    }


    var request = mkRecord.record.createSearchRequest(angular.merge({}, $scope.search, {
      from: from,
      geoDistance: $scope.search.geoDistance + $scope.geoUnit
    }));

    return $scope.doRequest(request, options);
  };

  $scope.updateLocationHref = function(stateParams) {
    console.debug("[market] [search] Update location href");
    $location.search(stateParams).replace();
  };

  $scope.doGetLastRecords = function() {
    $scope.hideActionsPopover();

    // Clean text
    $scope.search.text=null;
    $scope.search.lastRecords=true;

    return $scope.doSearch();
  };

  $scope.doRefresh = function(options) {
    return $scope.doSearch(0/*from*/, options);
  };

  $scope.refresh = function() {
    return $scope.doRefresh({withCache: false});
  };

  $scope.showMore = function() {
    var from = $scope.search.results ? $scope.search.results.length : 0;

    $scope.search.loadingMore = true;

    return $scope.doSearch(from)
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
    request.size = isNaN(request.size) ? defaultSearchLimit : request.size;
    //if (request.size < defaultSearchLimit) request.size = defaultSearchLimit;
    $scope.search.loading = (request.from === 0);

    return  mkRecord.record.search(request, options)
    .then(function(res) {

      if (!res || !res.hits || !res.hits.length) {
        $scope.search.results = (request.from > 0) ? $scope.search.results : [];
        $scope.search.total = (request.from > 0) ? $scope.search.total : (res.total || 0);
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
      if ($scope.search.results.length > 0 && $scope.motion) {
        $scope.motion.show();
      }
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

  $scope.clearAdvancedFilter = function() {
    angular.merge($scope.search, {type: null, showOld: false, showClosed: false, shipping: null});
  }

  $scope.showActionsPopover = function (event, url) {
    return UIUtils.popover.show(event, {
      templateUrl: url = url || 'plugins/market/templates/search/lookup_actions_popover.html',
      scope: $scope,
      afterShow: function(popover) {
        $scope.actionsPopover = popover;
      }
    });
  };

  $scope.hideActionsPopover = function () {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

  $scope.showSortPopover = function (event) {
    $scope.showActionsPopover(event, 'plugins/market/templates/search/lookup_sort_popover.html');
  };

  $scope.toggleSort = function (sort, direction){
    $scope.hideActionsPopover();
    direction = direction === 'desc' ? 'desc' : 'asc';
    if (this.search.sortAttribute !== sort || this.search.sortDirection !== direction) {
      this.search.sortAttribute = sort;
      this.search.sortDirection = direction;
      $scope.doSearch();
    }
  };

  $scope.toggleShowClosed = function() {
    $scope.hideActionsPopover();
    $scope.search.showClosed = !$scope.search.showClosed;
  };

  $scope.toggleShowOld = function() {
    $scope.hideActionsPopover();
    $scope.search.showOld = !$scope.search.showOld;
  };

  $scope.toggleShipping = function() {
    $scope.hideActionsPopover();
    $scope.search.shipping = !$scope.search.shipping;
  };

  $scope.toggleCompactMode = function() {
    $scope.search.compactMode = !$scope.search.compactMode;

    // Show description only if NOT compact mode
    $scope.options.description.show = !$scope.search.compactMode;
  };
}


function MkLookupController($scope, $rootScope, $controller, $focus, $timeout, $ionicPopover, $translate, $q,
                            mkCategory, mkRecord, csSettings, esShape) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('MkLookupAbstractCtrl', {$scope: $scope}));

  // Override defaults
  $scope.search.sortAttribute = 'creationTime';
  $scope.search.sortDirection = 'desc';

  $scope.enter = function(e, state) {
    if (!$scope.entered || !$scope.search.results || $scope.search.results.length === 0) {
      var showAdvanced = false;
      var jobs = [];

      // Restore compact mode, from settings
      $scope.search.compactMode = csSettings.data.plugins.market.compactMode;
      $scope.options.description.show = !$scope.search.compactMode;

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
        var location = state.stateParams.location && state.stateParams.location.trim();

        // Geo point
        if (state.stateParams.lat && state.stateParams.lon) {
          $scope.search.geoPoint = {
            lat: parseFloat(state.stateParams.lat),
            lon: parseFloat(state.stateParams.lon)
          };
          $scope.search.location = location;
        }
        else if (state.stateParams.shape) {
          // Resolve shape
          jobs.push(esShape.get(state.stateParams.shape)
            .then(function(shape) {
              // Store in scope
              $scope.search.geoShape = shape;
              $scope.search.location = location;
            }));
        }
        else {
          // Apply defaults from settings
          var defaultSearch = csSettings.data.plugins.market && csSettings.data.plugins.market.defaultSearch;
          if (defaultSearch) {
            console.info("[market] [search] Restoring last search from settings", defaultSearch);
            angular.merge($scope.search, defaultSearch);
          }
        }

        // Geo distance
        if (state.stateParams.dist) {
          $scope.search.geoDistance = parseInt(state.stateParams.dist);
        }
        // Search on hash tag
        if (state.stateParams.hash) {
          $scope.search.lastRecords = false;
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

        // Show shipping
        if (angular.isDefined(state.stateParams.shipping)) {
          $scope.search.shipping = true;
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
        );
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

  $scope.finishEnter = function(showAdvanced) {
    $scope.search.advanced = showAdvanced ? true : $scope.search.advanced; // keep null if first call
    $scope.doSearch()
        .then(function() {
          $scope.showFab('fab-add-market-record');
        });
    // removeIf(device)
    // Focus on search text (only if NOT device, to avoid keyboard opening)
    $focus('marketSearchText');

    // endRemoveIf(device)
    $scope.entered = true;
  };

  // Store some search options as settings defaults
  $scope.updateSettings = function(immediate) {
    var dirty = false;

    csSettings.data.plugins.market = csSettings.data.plugins.market || {};
    csSettings.data.plugins.market.defaultSearch = csSettings.data.plugins.market.defaultSearch || {};

    // Check if location, or distance changed
    var location = $scope.search.location && $scope.search.location.trim();
    var oldLocation = csSettings.data.plugins.market.defaultSearch.location;
    var odlDistance = csSettings.data.plugins.market.defaultSearch.geoDistance;
    if (!oldLocation || (oldLocation !== location) || !odlDistance || (odlDistance !== $scope.search.geoDistance)) {
      csSettings.data.plugins.market.defaultSearch = angular.merge(csSettings.data.plugins.market.defaultSearch, {
        location: location,
        geoPoint: location && $scope.search.geoPoint ? angular.copy($scope.search.geoPoint) : undefined,
        geoShape: location && $scope.search.geoShape ? angular.copy($scope.search.geoShape) : undefined,
        geoDistance: location && $scope.search.geoPoint ? $scope.search.geoDistance : undefined
      });
      // Copy geoDistance to ES (for page registry)
      csSettings.data.plugins.es.geoDistance = $scope.search.geoDistance;
      dirty = true;
    }

    var oldCompactMode = csSettings.data.plugins.market.compactMode;
    if (oldCompactMode === undefined || oldCompactMode != $scope.search.compactMode) {
      csSettings.data.plugins.market.compactMode = $scope.search.compactMode;
      dirty = true;
    }

    // execute with a delay, for better UI perf
    if (dirty) {
      console.debug("[market] [search] Storing search location to local settings...");
      if (immediate) {
        return csSettings.store();
      }
      else return $timeout(csSettings.store, 100);
    }
  };

  // Store some search options as settings defaults
  $scope.leave = function() {
    return $scope.updateSettings(true/*immediate*/);
  };
  $scope.$on('$ionicView.beforeLeave', function() {
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

  $scope.onGeoDistanceChanged = function() {
    if ($scope.search.loading || !$scope.entered || !$scope.search.location) return;
    $scope.doRefresh(); // Refresh results
  };
  $scope.$watch('search.geoDistance', $scope.onGeoDistanceChanged, true);

  $scope.onCategoryClick = function(cat) {
    if (!cat) return; // Skip
    $scope.search.category = cat;
    $scope.options.category.show = true;
    $scope.search.showCategories=false; // hide categories
    $scope.doSearch();
  };

  $scope.removeText = function() {
    $scope.search.text = null;
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

  $scope.showActionPopover = function (event, url) {
    url = url || 'plugins/market/templates/search/lookup_actions_popover.html';
    if ($scope.actionsPopoverUrl && $scope.actionsPopoverUrl !== url){
      $scope.actionsPopover.hide();
      $scope.actionsPopover = null;
    }
    $scope.actionsPopoverUrl = url;
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl(url, {
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

  $scope.showSortPopover = function (event) {
    $scope.showActionsPopover(event, 'plugins/market/templates/search/lookup_sort_popover.html');
  };

  $scope.toggleSort = function (sort, direction){
    $scope.hideActionsPopover();
    direction = direction === 'desc' ? 'desc' : 'asc';
    if (this.search.sortAttribute !== sort || this.search.sortDirection !== direction) {
      this.search.sortAttribute = sort;
      this.search.sortDirection = direction;
      $scope.doSearch();
    }
  };

  $scope.toggleCompactMode = function() {
    $scope.search.compactMode = !$scope.search.compactMode;

    // Show description only if NOT compact mode
    $scope.options.description.show = !$scope.search.compactMode;

    $scope.updateSettings();
  };
}


function MkCrowdfundingLookupController($scope, $rootScope, $controller) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('MkLookupCtrl', {$scope: $scope}));

  // Change market lookup defaults
  $scope.search.type = null;
  $scope.search.types = ['crowdfunding'];
  $scope.options.type.show = false;
  $scope.options.filter.lastRecords = true;
  $scope.options.filter.showShipping = false;
  $scope.options.title = 'MENU.CROWDFUNDING';
  $scope.options.searchTextHelp = 'MARKET.SEARCH.CROWDFUNDING.SEARCH_HELP';
}
