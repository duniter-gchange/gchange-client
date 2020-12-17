angular.module('cesium.es.app.controllers', ['ngResource', 'cesium.es.services'])

  // Configure menu items
  .config(function(PluginServiceProvider) {
    'ngInject';

    // Menu extension points
    PluginServiceProvider.extendState('app', {
       points: {
         'nav-buttons-right': {
           templateUrl: "plugins/es/templates/menu_extend.html",
           controller: "ESMenuExtendCtrl"
         },
         'menu-discover': {
           templateUrl: "plugins/es/templates/menu_extend.html",
           controller: "ESMenuExtendCtrl"
         },
         'menu-user': {
           templateUrl: "plugins/es/templates/menu_extend.html",
           controller: "ESMenuExtendCtrl"
         },
         'profile-popover-user': {
           templateUrl: "plugins/es/templates/common/popover_profile_extend.html",
           controller: "ESProfilePopoverExtendCtrl"
         }
       }
      });

    // Notification on home page
    PluginServiceProvider.extendState('app.home', {
      points: {
        'header-buttons': {
          templateUrl: "plugins/es/templates/home/home_extend.html",
          controller: "ESExtensionCtrl"
        }
      }
    });
  })

 .controller('ESExtensionCtrl', ESExtensionController)

 .controller('ESJoinCtrl', ESJoinController)

 .controller('ESMenuExtendCtrl', ESMenuExtendController)

 .controller('ESProfilePopoverExtendCtrl', ESProfilePopoverExtendController)

;

/**
 * Generic controller, that enable/disable depending on esSettings enable/disable
 */
function ESExtensionController($scope, esSettings, PluginService) {
  'ngInject';
  $scope.extensionPoint = PluginService.extensions.points.current.get();

  $scope.enable = true; // Always enable, on gchange
}

/**
 * Control new account wizard extend view
 */
function ESJoinController($scope, esSettings, PluginService) {
  'ngInject';
  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = true; // Always enable, on gchange
}

/**
 * Control menu extension
 */
function ESMenuExtendController($scope, $state, PluginService, esSettings, UIUtils) {
  'ngInject';
  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = esSettings.isEnable();

  $scope.showRegistryLookupView = function() {
    $state.go(UIUtils.screen.isSmall() ? 'app.registry_lookup': 'app.registry_lookup_lg');
  };

  $scope.showNotificationsPopover = function(event) {
    return UIUtils.popover.show(event, {
        templateUrl :'plugins/es/templates/notification/popover_notification.html',
        scope: $scope,
        autoremove: false // reuse popover
      });
  };

  $scope.showMessagesPopover = function(event) {
    return UIUtils.popover.show(event, {
      templateUrl :'plugins/es/templates/message/popover_message.html',
      scope: $scope,
      autoremove: false // reuse popover
    });
  };

  $scope.showInvitationsPopover = function(event) {
    return UIUtils.popover.show(event, {
      templateUrl :'plugins/es/templates/invitation/popover_invitation.html',
      scope: $scope,
      autoremove: false // reuse popover
    });
  };

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });
}

/**
 * Control profile popover extension
 */
function ESProfilePopoverExtendController($scope, $state, csSettings, csWallet) {
  'ngInject';

  $scope.updateView = function() {
    $scope.enable = csWallet.isLogin() && (
        (csSettings.data.plugins && csSettings.data.plugins.es) ?
          csSettings.data.plugins.es.enable :
          !!csSettings.data.plugins.host);
  };

  $scope.showEditUserProfile = function() {
    $scope.closeProfilePopover();
    $state.go('app.user_edit_profile');
  };

  csSettings.api.data.on.changed($scope, $scope.updateView);
  csSettings.api.data.on.ready($scope, $scope.updateView);
  csWallet.api.data.on.login($scope, function(data, deferred){
    deferred = deferred || $q.defer();
    $scope.updateView();
    deferred.resolve();
    return deferred.promise;
  });
  csWallet.api.data.on.logout($scope, $scope.updateView);
  $scope.updateView();

}
