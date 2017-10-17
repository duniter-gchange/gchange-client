angular.module('cesium.market.app.controllers', ['ngResource', 'cesium.es.services', 'cesium.market.modal.services'])

  // Configure menu items
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Menu extension points
      PluginServiceProvider.extendState('app', {
         points: {
           'menu-main': {
             templateUrl: "plugins/market/templates/menu_extend.html",
             controller: "MarketMenuExtendCtrl"
           },
           'menu-user': {
             templateUrl: "plugins/market/templates/menu_extend.html",
             controller: "MarketMenuExtendCtrl"
           }
         }
        });

        // Home extension points
        PluginServiceProvider.extendState('app.home', {
            points: {
                'buttons': {
                    templateUrl: "plugins/market/templates/home/home_extend.html",
                    controller: "MarketHomeExtendCtrl"
                }
            }
        });
    }
  })

 .controller('MarketMenuExtendCtrl', MarketMenuExtendController)

 .controller('MarketHomeExtendCtrl', MarketHomeExtendController)
;


/**
 * Control menu extension
 */
function MarketMenuExtendController($scope, esSettings, PluginService) {
    'ngInject';

    $scope.extensionPoint = PluginService.extensions.points.current.get();
    $scope.enable = esSettings.isEnable();

    esSettings.api.state.on.changed($scope, function(enable) {
        $scope.enable = enable;
    });
}


/**
 * Control home extension
 */
function MarketHomeExtendController($scope, $rootScope, $state, $controller, $focus, $timeout,
                                    ModalUtils, UIUtils, csConfig, esSettings, mkModals) {
    'ngInject';

    // Initialize the super class and extend it.
    angular.extend(this, $controller('ESPositionEditCtrl', {$scope: $scope}));

    $scope.enable = esSettings.isEnable();
    $scope.search = {
        location: undefined
    };

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

    esSettings.api.state.on.changed($scope, function(enable) {
        $scope.enable = enable;
    });

    $scope.doSearch = function() {
      if ($scope.search.location) {
        return $scope.localizeByAddress($scope.search.location)
          .then(function(res) {
            if (!res) return;
            var location = res.name && res.name.split(',')[0] || $scope.search.location;
            $rootScope.geoPoints = $rootScope.geoPoints || {};
            $rootScope.geoPoints[location] = res;
            $state.go('app.market_lookup', {location: location});
          });
      }
    };

    $scope.showNewRecordModal = function() {
        return $scope.loadWallet({minData: true})
            .then(function() {
                return UIUtils.loading.hide();
            }).then(function() {
                if (!$scope.options.type.show && $scope.options.type.default) {
                    console.log($scope.options);
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

    // Override default join and help modal (in the parent scope)
    $scope.$parent.showJoinModal = mkModals.showJoin;
    $scope.$parent.showLoginModal = mkModals.showLogin;
    $scope.$parent.showHelpModal = mkModals.showHelp;

    // removeIf(device)
    // Focus on search text (only if NOT device, to avoid keyboard opening)
    if (!UIUtils.screen.isSmall()) {
      $timeout(function() {
        $focus('searchLocationInput');
      }, 500);
    }
    // endRemoveIf(device)
}
