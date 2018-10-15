angular.module('cesium.market.wallet.controllers', ['cesium.es.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider.extendState('app.view_wallet', {
          points: {
            'general': {
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
                      controller: 'MkWalletRecordsCtrl'
                  }
              }
          })
  })

 .controller('MarketWalletViewCtrl', MarketWalletViewController)

  .controller('MkWalletRecordsCtrl', MarketWalletRecordsController)

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
    angular.extend(this, $controller('MkLookupAbstractCtrl', {$scope: $scope}));

    $scope.search.showClosed = true;
    $scope.smallscreen = UIUtils.screen.isSmall();

    $scope.enter = function(e, state) {
        $scope.loadWallet()
            .then(function(walletData) {
                $scope.search.text = walletData.pubkey;
                $scope.search.lastRecords=false;
                $scope.search.sortAttribute="creationTime";
                $scope.search.sortDirection="desc";

                if (!$scope.entered || !$scope.search.results || $scope.search.results.length === 0) {
                    $scope.doSearch()
                        .then(function() {
                            $scope.showFab('fab-wallet-add-market-record');
                        });
                }

            })
            .catch(function(err){
                if (err == 'CANCELLED') {
                    return $scope.showHome();
                }
                console.error(err);
            });
        $scope.entered = true;
    };
    $scope.$on('$ionicView.enter', $scope.enter);
}