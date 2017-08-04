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
function MarketHomeExtendController($scope, $state, Modals, ModalUtils, UIUtils, esSettings, csWallet, mkModals) {
    'ngInject';
    $scope.enable = esSettings.isEnable();

    esSettings.api.state.on.changed($scope, function(enable) {
        $scope.enable = enable;
    });

    $scope.showNewRecordModal = function() {
        if (!csWallet.isLogin()) {
            $state.go('app.market_add_record', {type: 'offer'});
        }
        else {
            return $scope.loadWallet({minData: true})
                .then(function () {
                    return UIUtils.loading.hide();
                }).then(function () {
                    return ModalUtils.show('plugins/market/templates/modal_record_type.html');
                })
                .then(function (type) {
                    if (type) {
                        $state.go('app.market_add_record', {type: type});
                    }
                });
        }
    };

    // Override default join modal (in the parent scope)
    $scope.$parent.showJoinModal = mkModals.showJoin;
    $scope.$parent.showHelpModal = mkModals.showHelp;
    $scope.$parent.showHelpModal = mkModals.showHelp;
}
