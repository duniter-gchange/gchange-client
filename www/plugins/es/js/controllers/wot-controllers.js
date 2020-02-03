angular.module('cesium.es.wot.controllers', ['cesium.es.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider

        .extendStates(['app.wot_identity', 'app.wot_identity_uid'], {
          points: {
            'hero': {
              templateUrl: "plugins/es/templates/wot/view_identity_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            },
            'general': {
              templateUrl: "plugins/es/templates/wot/view_identity_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            },
            'after-general': {
              templateUrl: "plugins/es/templates/wot/view_identity_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            },
            'buttons': {
              templateUrl: "plugins/es/templates/wot/view_identity_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            },
            'buttons-top-fab': {
              templateUrl: "plugins/es/templates/wot/view_identity_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            },
          }
        })
      ;
    }

  })

 .controller('ESWotIdentityViewCtrl', ESWotIdentityViewController)


;

function ESWotIdentityViewController($scope, $controller, $ionicPopover, UIUtils, csWallet, esProfile, esModals) {
  'ngInject';

  $scope.options = $scope.options || {};
  $scope.options.like = $scope.options.like || {
    kinds: esHttp.constants.like.KINDS,
    index: 'user',
    type: 'profile',
    service: esProfile.like
  };
  $scope.smallscreen = angular.isDefined($scope.smallscreen) ? $scope.smallscreen : UIUtils.screen.isSmall();

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESLikesCtrl', {$scope: $scope}));

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESExtensionCtrl', {$scope: $scope}));


  /* -- modals -- */

  $scope.showNewMessageModal = function(confirm) {
    return $scope.loadWallet({minData: true})

      .then(function() {
        UIUtils.loading.hide();

        // Ask confirmation, if user has no Cesium+ profil
        if (!confirm && !$scope.formData.profile) {
          return UIUtils.alert.confirm('MESSAGE.CONFIRM.USER_HAS_NO_PROFILE')
            .then(function (confirm) {
              // Recursive call (with confirm flag)
              if (confirm) return true;
            });
        }
        return true;
      })
      // Open modal
      .then(function(confirm) {
        if (!confirm) return false;

        return esModals.showMessageCompose({
          destPub: $scope.formData.pubkey,
          destUid: $scope.formData.name||$scope.formData.uid
        })
        .then(function(sent) {
          if (sent) UIUtils.toast.show('MESSAGE.INFO.MESSAGE_SENT');
        });
      });

  };

  /* -- likes -- */

  // Load likes, when profile loaded
  $scope.$watch('formData.pubkey', function(pubkey) {
    if (pubkey) {
      $scope.loadLikes(pubkey);
    }
  });

  /* -- Popover -- */

  $scope.showActionsPopover = function (event) {
    UIUtils.popover.show(event, {
      templateUrl: 'plugins/es/templates/wot/view_popover_actions.html',
      scope: $scope,
      autoremove: true,
      afterShow: function(popover) {
        $scope.actionsPopover = popover;
      }
    });
  };

  $scope.hideActionsPopover = function () {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
      $scope.actionsPopover = null;
    }
    return true;
  };

  if ($scope.extensionPoint === 'buttons-top-fab') {
    // Show fab button, when parent execute motions
    $scope.$on('$csExtension.motion', function(event) {
      var canCompose = !!$scope.formData.profile;
      if (canCompose) {
        $scope.showFab('fab-compose-' + $scope.formData.pubkey);
      }
    });
  }

  // TODO : for DEV only
  /*$timeout(function() {
    if ($scope.extensionPoint != 'buttons') return;
    $scope.showSuggestCertificationModal();
  }, 1000);*/
}
