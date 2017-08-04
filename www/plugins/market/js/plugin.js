angular.module('cesium.market.services', [
    'cesium.market.modal.services',
    'cesium.market.record.services',
    'cesium.market.wallet.services',
    'cesium.market.settings.services'
]);


angular.module('cesium.market.plugin', [
    'cesium.market.app.controllers',
    'cesium.market.join.controllers',
    'cesium.market.login.controllers',
    'cesium.market.record.controllers',
    'cesium.market.wallet.controllers',
    'cesium.market.category.controllers',
    'cesium.market.wot.controllers',

    // Services
    'cesium.market.services'
  ])

  .run(function(Modals, mkModals) {

      console.log("[plugin] [market] Override login and join modals");
      Modals.showLogin = mkModals.showLogin;
      Modals.showJoin = mkModals.showJoin;
  });

