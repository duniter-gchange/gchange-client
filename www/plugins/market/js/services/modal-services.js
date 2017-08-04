angular.module('cesium.market.modal.services', ['cesium.modal.services'])

.factory('mkModals', function(ModalUtils) {
  'ngInject';

  function showJoinModal(parameters) {
    return ModalUtils.show('plugins/market/templates/join/modal_join.html', 'MkJoinModalCtrl', parameters);
  }

  function showHelpModal(parameters) {
    return ModalUtils.show('plugins/market/templates/help/modal_help.html', 'HelpModalCtrl', parameters);
  }

  function showLoginModal(parameters) {
    return ModalUtils.show('plugins/market/templates/login/modal_login.html', 'MarketLoginModalCtrl', parameters);
  }

  function showEventLoginModal(parameters) {
    return ModalUtils.show('plugins/market/templates/login/modal_event_login.html', 'MarketEventLoginModalCtrl', parameters);
  }

  return {
    showHelp: showHelpModal,
    showJoin: showJoinModal,
    showLogin: showLoginModal,
    showEventLogin: showEventLoginModal
  };

});
