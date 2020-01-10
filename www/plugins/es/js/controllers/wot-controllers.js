angular.module('cesium.es.wot.controllers', ['cesium.es.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider

        .extendStates(['app.wot_identity', 'app.wot_identity_uid'], {
          points: {
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

        .extendStates(['app.wot_cert', 'app.wot_cert_lg', 'app.wallet_cert', 'app.wallet_cert_lg'], {
          points: {
            'nav-buttons': {
              templateUrl: "plugins/es/templates/wot/view_certifications_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            },
            'buttons': {
              templateUrl: "plugins/es/templates/wot/view_certifications_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            }
          }
        })
      ;
    }

  })

 .controller('ESWotIdentityViewCtrl', ESWotIdentityViewController)

;

function ESWotIdentityViewController($scope, $controller, $ionicPopover, UIUtils, esModals, esProfile) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESExtensionCtrl', {$scope: $scope}));

  $scope.stars = {};

  $scope.addStar = function(event, level) {
    return esProfile.like.add($scope.formData.pubkey, {kind: 'star', level: level || 1})
        .then(function() {
          $scope.stars.wasHit = true;
          $scope.stars.level = level || 1;
        });
  };

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

  /* -- Popover -- */

  $scope.showCertificationActionsPopover = function(event) {
    if (!$scope.certificationActionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/es/templates/wot/popover_certification_actions.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.certificationActionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.certificationActionsPopover.remove();
        });
        $scope.certificationActionsPopover.show(event);
      });
    }
    else {
      $scope.certificationActionsPopover.show(event);
    }
  };

  $scope.hideCertificationActionsPopover = function() {
    if ($scope.certificationActionsPopover) {
      $scope.certificationActionsPopover.hide();
    }
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

