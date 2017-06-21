angular.module('cesium.market.wallet.controllers', ['cesium.es.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider.extendState('app.view_wallet', {
          points: {
            'before-technical': {
              templateUrl: "plugins/market/templates/wallet/view_wallet_extend.html",
              controller: 'MarketWalletViewCtrl'
            }
          }
        })
      ;
    }

      $stateProvider

          .state('app.market_wallet_records', {
              url: "/records/wallet",
              views: {
                  'menuContent': {
                      templateUrl: "plugins/market/templates/wallet/view_wallet_records.html",
                      controller: 'ESMarketWalletRecordsCtrl'
                  }
              }
          })
  })

 .controller('MarketWalletViewCtrl', MarketWalletViewController)

  .controller('ESMarketWalletRecordsCtrl', MarketWalletRecordsController)

;

function MarketWalletViewController($scope, esSettings) {
  'ngInject';

  $scope.enable = esSettings.isEnable();

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });

}

function MarketWalletRecordsController($scope, $controller, UIUtils) {

    // Initialize the super class and extend it.
    angular.extend(this, $controller('ESMarketLookupCtrl', {$scope: $scope}));

    $scope.search.focusElementId = undefined;
    $scope.search.fabAddNewRecordId = 'fab-wallet-add-market-record';
    $scope.smallscreen = UIUtils.screen.isSmall();

    $scope.$on('$ionicView.enter', function(e, state) {
        $scope.loadWallet()
            .then(function(walletData) {
                $scope.search.text = walletData.pubkey;
                $scope.search.lastRecords=false;

                if (!$scope.entered || !$scope.search.results || $scope.search.results.length === 0) {
                    $scope.enter(e, state);
                }

            })
            .catch(function(err){
                if (err == 'CANCELLED') {
                    return $scope.showHome();
                }
                console.error(err);
            });
    });

    // Redirection to full text search
    var defaultFinishEnter = $scope.finishEnter;
    $scope.finishEnter = function(hasOptions) {
        defaultFinishEnter(true/*force to execute a standard serach*/);
    };
}