angular.module('cesium.market.modal.services', ['cesium.modal.services'])

.factory('mkModals', function(ModalUtils) {
  'ngInject';

  function showJoinModal(parameters) {
    return ModalUtils.show('plugins/market/templates/join/modal_join.html', 'MkJoinModalCtrl', parameters);
  }

  function showHelpModal(parameters) {
    return ModalUtils.show('plugins/market/templates/help/modal_help.html', 'HelpModalCtrl', parameters);
  }

  return {
    showHelp: showHelpModal,
    showJoin: showJoinModal
  };

});
