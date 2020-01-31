angular.module('cesium.market.wot.controllers', ['cesium.es.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider.extendStates(['app.wot_identity', 'app.wot_identity_uid'], {
          points: {
              'general': {
                  templateUrl: "plugins/market/templates/wot/view_identity_extend.html",
                  controller: 'ESExtensionCtrl'
              },
              'after-general': {
                  templateUrl: "plugins/market/templates/wot/view_identity_extend.html",
                  controller: 'ESExtensionCtrl'
              }
          }
      })
      ;
    }

    $stateProvider

      .state('app.market_identity_records', {
          url: "/market/records/:pubkey",
          views: {
             'menuContent': {
                templateUrl: "plugins/market/templates/wot/view_identity_records.html",
                controller: 'MkIdentityRecordsCtrl'
              }
          }
       })
  })

  .controller('MkIdentityRecordsCtrl', MkIdentityRecordsController)

;


function MkIdentityRecordsController($scope, $controller, UIUtils) {

    // Initialize the super class and extend it.
    angular.extend(this, $controller('MkLookupAbstractCtrl', {$scope: $scope}));

    $scope.smallscreen = UIUtils.screen.isSmall();

    $scope.enter = function(e, state) {
        $scope.pubkey = state && state.stateParams && state.stateParams.pubkey;
        if (!$scope.pubkey) return $scope.showHome();

        $scope.search.text = $scope.pubkey;
        $scope.search.lastRecords=false;

        $scope.doSearch();
        $scope.entered = true;
    };
    $scope.$on('$ionicView.enter', $scope.enter);

}
