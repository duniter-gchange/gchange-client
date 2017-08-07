angular.module('cesium.es.wot.controllers', ['cesium.es.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider

        .extendStates(['app.wot_identity', 'app.wot_identity_uid'], {
          points: {
            'general': {
              templateUrl: "plugins/es/templates/wot/view_identity_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            },
            'buttons': {
              templateUrl: "plugins/es/templates/wot/view_identity_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            }
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

function ESWotIdentityViewController($scope, $ionicPopover, $q, UIUtils, Modals, esSettings, PluginService,
                                     esModals, esHttp, esWallet) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = esSettings.isEnable();
  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });

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


  // TODO : for DEV only
  /*$timeout(function() {
    if ($scope.extensionPoint != 'buttons') return;
    $scope.showSuggestCertificationModal();
  }, 1000);*/
}

