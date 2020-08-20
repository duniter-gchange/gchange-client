angular.module('cesium.market.services', [
  // removeIf(device)
  'cesium.market.converse.services',
  // endRemoveIf(device)
  'cesium.market.modal.services',
  'cesium.market.record.services',
  'cesium.market.wallet.services',
  'cesium.market.settings.services',
  'cesium.market.category.services'
]);


angular.module('cesium.market.plugin', [
    'cesium.market.app.controllers',
    'cesium.market.join.controllers',
    'cesium.market.login.controllers',
    'cesium.market.search.controllers',
    'cesium.market.record.controllers',
    'cesium.market.wallet.controllers',
    'cesium.market.category.controllers',
    'cesium.market.wot.controllers',
    'cesium.market.document.controllers',

    // Services
    'cesium.market.services'
  ])

  .run(function(csConfig, Modals, mkModals) {

    if (csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.enable) {

      console.debug("[plugin] [market] Override login and join modals");
      Modals.showLogin = mkModals.showLogin;
      Modals.showJoin = mkModals.showJoin;
    }
  });

