angular.module('cesium.market.app.controllers', ['ngResource',
  'cesium.es.services', 'cesium.market.modal.services'])

  // Configure menu items
  .config(function(PluginServiceProvider) {
    'ngInject';

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
         },
         'menu-discover': {
           templateUrl: "plugins/market/templates/menu_extend.html",
           controller: "MarketMenuExtendCtrl"
         },

         /* TODO update counter when changes
         'nav-buttons-right': {
           templateUrl: "plugins/market/templates/menu_extend.html",
           controller: "MarketMenuExtendCtrl"
         }*/
       }
      });
  })

 .controller('MarketMenuExtendCtrl', MarketMenuExtendController)

;


/**
 * Control menu extension
 */
function MarketMenuExtendController($scope, PluginService) {
    'ngInject';

    $scope.extensionPoint = PluginService.extensions.points.current.get();
}
