angular.module('cesium.market.home.controllers', ['ngResource',
  'cesium.es.services', 'cesium.market.modal.services'])

  // Configure menu items
  .config(function(PluginServiceProvider) {
    'ngInject';

    // Home extension points
    PluginServiceProvider.extendState('app.home', {
      points: {
        'buttons': {
            templateUrl: "plugins/market/templates/home/home_buttons.html",
            controller: "MarketHomeButtonsCtrl"
        },
        'footer-start': {
          templateUrl: "plugins/market/templates/category/list_categories_lg.html",
          controller: "MarketHomeFooterCtrl"
        }
      }
    });
  })


 .controller('MarketHomeButtonsCtrl', MarketHomeButtonsController)

 .controller('MarketHomeFooterCtrl', MarketHomeFooterController)
;

/**
 * Footer controller
 */
function MarketHomeFooterController($scope, $controller, UIUtils, csPlatform, $state) {
  'ngInject';

  $scope.start = function() {
    // Start loading categories, if NOT small screen
    if (!UIUtils.screen.isSmall()) {
      // Initialize the super class and extend it.
      angular.extend(this, $controller('MkListCategoriesCtrl', {$scope: $scope}));

      $scope.onCategoryClick = function(cat) {
        return $state.go('app.market_lookup', {category: cat && cat.id, location: ''});
      };

      $scope.load();
    }
    else {
      $scope.loading = false;
    }
  };

  // Run start
  csPlatform.ready().then($scope.start);

}

/**
 * Control home extension
 */
function MarketHomeButtonsController($scope, $rootScope, $state, $controller, $focus, $timeout, $translate,
                                    PluginService, ModalUtils, UIUtils, csConfig, csSettings, mkModals) {
    'ngInject';

    // Initialize the super class and extend it.
    angular.extend(this, $controller('MkLookupCtrl', {$scope: $scope}));

    $scope.extensionPoint = PluginService.extensions.points.current.get();

    // Screen options
    $scope.options = $scope.options || angular.merge({
        type: {
            show: true
        },
        location: {
            show: true,
            prefix : undefined
        }
    }, csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.record || {});

    $scope.enter = function(e, state) {
        if (!csSettings.isStarted()) {
            return csSettings.ready().then(function() {
                return $scope.enter(e, state);
            });
        }

        // Load existing search
        var defaultSearch = csSettings.data.plugins.market.defaultSearch;
        if (defaultSearch) {
            console.info("[market] [search] Restoring last search from settings", defaultSearch);
            angular.merge($scope.search, defaultSearch);
        }

        if (!$scope.entered) {
            console.debug("[market] [home] Init home buttons");

            return $scope.init()
                .then(function() {
                    $scope.entered = true;
                    $scope.search.loading = false;

                    $scope.doGetLastRecords();
                });
        }
    }
    $scope.$on('$ionicParentView.enter', $scope.enter);

    // Override inherited doRequest()
    var inheritedDoRequest = $scope.doRequest;
    $scope.doRequest = function(request, options) {
        request = request || {};

        // Override size with size=0, to get only the total
        request.size = 0;
        return inheritedDoRequest(request, options)
            .then(function() {
                // Update total
                $scope.$broadcast('$$rebind::total');
            })
    }

    $scope.openSearch = function(locationName) {
        var stateParams = {};

        // Search text
        var searchText = ($scope.search.text || '').trim();
        if (searchText.length) stateParams.q = searchText;

        // Resolve location position
        if (!$scope.search.geoPoint && !$scope.search.geoShape) {
            return $scope.searchPosition($scope.search.location)
                .then(function(res) {
                    if (res) {
                        $scope.search.geoPoint = res;
                        // No location = Around me
                        if (!$scope.search.location) {
                          $scope.search.geoPoint.exact= true;
                          return $translate("MARKET.COMMON.AROUND_ME")
                            .then(function(locationName) {
                              return $scope.openSearch(locationName); // Loop
                            });
                        }
                        return $scope.openSearch(); // Loop
                    }
                })
                .catch(function(err) {
                  console.error(err);
                  return $state.go('app.market_lookup', stateParams);
                });
        }

        var locationShortName = locationName || $scope.search.location && $scope.search.location.split(', ')[0];
        if (locationShortName && $scope.search.geoPoint) {
          $rootScope.geoPoints = $rootScope.geoPoints || {};
          $rootScope.geoPoints[locationShortName] = $scope.search.geoPoint;
          stateParams = angular.merge(stateParams, {
              lat: $scope.search.geoPoint && $scope.search.geoPoint.lat,
              lon: $scope.search.geoPoint && $scope.search.geoPoint.lon,
              location: locationShortName,
              dist: $scope.search.geoDistance
          });
        }
        else {
            $scope.search.geoPoint = undefined;
        }

        // Update settings (saved as default search)
        $scope.updateSettings();

        // Redirect to search page
        return $state.go('app.market_lookup', stateParams);
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

    $scope.updateLocationHref = function(stateParams) {
        // Do not change location href
    }

    // Override default join and help modal (in the parent scope)
    $scope.$parent.showJoinModal = mkModals.showJoin;
    $scope.$parent.showLoginModal = mkModals.showLogin;
    $scope.$parent.showHelpModal = mkModals.showHelp;

}

