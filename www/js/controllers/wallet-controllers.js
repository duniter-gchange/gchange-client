angular.module('cesium.wallet.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider


      .state('app.view_wallet', {
        url: "/wallet",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/view_wallet.html",
            controller: 'WalletCtrl'
          }
        }
      })
    ;
  })


  .controller('WalletCtrl', WalletController)

;

function WalletController($scope, $q, $ionicPopup, $timeout, $state,
                          UIUtils, csWallet, $translate, $ionicPopover, Modals, csSettings,
                          esHttp) {
  'ngInject';

  $scope.loading = true;
  $scope.settings = csSettings.data;

  $scope.$on('$ionicView.enter', function() {
    if ($scope.loading) { // load once
      $scope.loadWallet()
        .then(function(walletData) {
          $scope.formData = walletData;
          $scope.loading=false; // very important, to avoid TX to be display before wallet.currentUd is loaded
          $scope.updateView();
          //$scope.showQRCode('qrcode', $scope.formData.pubkey, 1100);
          //$scope.showHelpTip();
          UIUtils.loading.hide(); // loading could have be open (e.g. new account)
        })
        .catch(function(err){
          if (err == 'CANCELLED') {
            $scope.showHome();
          }
        });
    }
    else {
      // update view (to refresh profile and subscriptions)
      $scope.updateView();
    }
  });

  $scope.updateView = function() {
    $scope.motion.show({selector: '#wallet .item'});
    $scope.$broadcast('$$rebind::' + 'rebind'); // force rebind
  };
  // Listen new events (can appears from security wizard also)
  $scope.$watchCollection('formData.events', function(newEvents, oldEvents) {
    if (!oldEvents || $scope.loading || angular.equals(newEvents, oldEvents)) return;
    $scope.updateView();
  });

  $scope.setRegisterForm = function(registerForm) {
    $scope.registerForm = registerForm;
  };

  // Clean controller data when logout
  $scope.onWalletLogout = function() {
    delete $scope.qrcode; // clean QRcode
    delete $scope.formData;
    $scope.loading = true;
  };
  csWallet.api.data.on.logout($scope, $scope.onWalletLogout);

  // Ask uid
  $scope.showUidPopup = function() {
    return $q(function(resolve, reject) {
      $translate(['ACCOUNT.NEW.TITLE', 'ACCOUNT.POPUP_REGISTER.TITLE', 'ACCOUNT.POPUP_REGISTER.HELP', 'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
        .then(function (translations) {
          $scope.formData.newUid = (!!$scope.formData.uid ? ''+$scope.formData.uid : '');

          // Choose UID popup
          $ionicPopup.show({
            templateUrl: 'templates/wallet/popup_register.html',
            title: translations['ACCOUNT.POPUP_REGISTER.TITLE'],
            subTitle: translations['ACCOUNT.POPUP_REGISTER.HELP'],
            scope: $scope,
            buttons: [
              { text: translations['COMMON.BTN_CANCEL'] },
              {
                text: translations['COMMON.BTN_OK'],
                type: 'button-positive',
                onTap: function(e) {
                  $scope.registerForm.$submitted=true;
                  if(!$scope.registerForm.$valid || !$scope.formData.newUid) {
                    //don't allow the user to close unless he enters a uid
                    e.preventDefault();
                  } else {
                    return $scope.formData.newUid;
                  }
                }
              }
            ]
          })
          .then(function(uid) {
            if (!uid) { // user cancel
              delete $scope.formData.uid;
              UIUtils.loading.hide();
              return;
            }
            resolve(uid);
          });
        });
      });
  };

  // Send self identity
  $scope.self = function() {
    $scope.hideActionsPopover();

    return $scope.showUidPopup()
    .then(function(uid) {
      UIUtils.loading.show();

      return csWallet.self(uid)
      .then(function() {
        $scope.updateView();
        UIUtils.loading.hide();
      })
      .catch(function(err){
         UIUtils.onError('ERROR.SEND_IDENTITY_FAILED')(err)
         .then(function() {
           $scope.self(); // loop
         });
      });
    });
  };

  $scope.doMembershipIn = function(retryCount) {
    return csWallet.membership.inside()
      .then(function() {
        $scope.updateView();
        UIUtils.loading.hide();
      })
      .catch(function(err) {
        if (!retryCount || retryCount <= 2) {
          $timeout(function() {
            $scope.doMembershipIn(retryCount ? retryCount+1 : 1);
          }, 1000);
        }
        else {
          UIUtils.onError('ERROR.SEND_MEMBERSHIP_IN_FAILED')(err)
            .then(function() {
              $scope.membershipIn(); // loop
            });
        }
      });
  };


  // Send membership IN
  $scope.membershipIn = function() {
    $scope.hideActionsPopover();

    if ($scope.formData.isMember) {
      return UIUtils.alert.info("INFO.NOT_NEED_MEMBERSHIP");
    }

    return $scope.showUidPopup()
    .then(function (uid) {
      UIUtils.loading.show();
      // If uid changed, or self blockUid not retrieve : do self() first
      if (!$scope.formData.blockUid || uid != $scope.formData.uid) {
        $scope.formData.blockUid = null;
        $scope.formData.uid = uid;
        csWallet.self(uid, false/*do NOT load membership here*/)
        .then(function() {
          $scope.doMembershipIn();
        })
        .catch(function(err){
          UIUtils.onError('ERROR.SEND_IDENTITY_FAILED')(err)
            .then(function() {
              $scope.membershipIn(); // loop
            });
        });
      }
      else {
        $scope.doMembershipIn();
      }
    })
    .catch(function(err){
       UIUtils.loading.hide();
       UIUtils.alert.info(err);
       $scope.membershipIn(); // loop
    });
  };

  // Send membership OUT
  $scope.membershipOut = function(confirm, confirmAgain) {
    $scope.hideActionsPopover();

    // Ask user confirmation
    if (!confirm) {
      return UIUtils.alert.confirm('CONFIRM.MEMBERSHIP_OUT', 'CONFIRM.POPUP_WARNING_TITLE', {
        cssClass: 'warning',
        okText: 'COMMON.BTN_YES',
        okType: 'button-assertive'
      })
      .then(function(confirm) {
        if (confirm) $scope.membershipOut(true); // loop with confirmation
      });
    }

    if (!confirmAgain) {
      return UIUtils.alert.confirm("CONFIRM.MEMBERSHIP_OUT_2", 'CONFIRM.POPUP_TITLE', {
        cssClass: 'warning',
        okText: 'COMMON.BTN_YES',
        okType: 'button-assertive'
      })
      .then(function (confirm) {
        if (confirm) $scope.membershipOut(true, true); // loop with all confirmations
      });
    }

    UIUtils.loading.show();
    return csWallet.membership.out()
      .then(function() {
        UIUtils.loading.hide();
        UIUtils.toast.show('INFO.MEMBERSHIP_OUT_SENT');
    })
    .catch(UIUtils.onError('ERROR.SEND_MEMBERSHIP_OUT_FAILED'));
  };

  // Updating wallet data
  $scope.doUpdate = function() {
    console.debug('[wallet] Updating wallet...');
    return UIUtils.loading.show()
      .then(function() {
        return csWallet.refreshData();
      })
      .then(function() {
        return UIUtils.loading.hide();
      })
      .then(function() {
        $scope.updateView();
      })
      .catch(UIUtils.onError('ERROR.REFRESH_WALLET_DATA'));
  };

  /**
   * Renew membership
   */
  $scope.renewMembership = function(confirm) {

    if (!$scope.formData.isMember) {
      return UIUtils.alert.error("ERROR.ONLY_MEMBER_CAN_EXECUTE_THIS_ACTION");
    }
    if (!confirm && !$scope.formData.requirements.needRenew) {
      return $translate("CONFIRM.NOT_NEED_RENEW_MEMBERSHIP", {membershipExpiresIn: $scope.formData.requirements.membershipExpiresIn})
        .then(function(message) {
          return UIUtils.alert.confirm(message);
        })
        .then(function(confirm) {
          if (confirm) $scope.renewMembership(true); // loop with confirm
        });
    }

    return UIUtils.alert.confirm("CONFIRM.RENEW_MEMBERSHIP")
      .then(function(confirm) {
        if (confirm) {
          UIUtils.loading.show();
          return $scope.doMembershipIn();
        }
      })
      .catch(function(err){
        UIUtils.loading.hide();
        UIUtils.alert.error(err)
          // loop
          .then($scope.renewMembership);
      });
  };


  /**
   * Fix identity (e.g. when identity expired)
   */
  $scope.fixIdentity = function() {
    if (!$scope.formData.uid) return;

    return $translate('CONFIRM.FIX_IDENTITY', {uid: $scope.formData.uid})
      .then(function(message) {
        return UIUtils.alert.confirm(message);
      })
      .then(function(confirm) {
        if (!confirm) return;
        UIUtils.loading.show();
        // Reset membership data
        $scope.formData.blockUid = null;
        $scope.formData.sigDate = null;
        return csWallet.self($scope.formData.uid);
      })
      .then(function() {
        return $scope.doMembershipIn();
      })
      .catch(function(err){
        UIUtils.loading.hide();
        UIUtils.alert.error(err)
          .then(function() {
            $scope.fixIdentity(); // loop
          });
      });
  };

  /**
   * Fix membership, when existing MS reference an invalid block
   */
  $scope.fixMembership = function() {
    if (!$scope.formData.uid) return;

    return UIUtils.alert.confirm("CONFIRM.FIX_MEMBERSHIP")
      .then(function(confirm) {
        if (!confirm) return;
        UIUtils.loading.show();
        // Reset membership data
        $scope.formData.blockUid = null;
        $scope.formData.sigDate = null;
        return Wallet.self($scope.formData.uid, false/*do NOT load membership here*/);
      })
      .then(function() {
        return $scope.doMembershipIn();
      })
      .catch(function(err){
        UIUtils.loading.hide();
        UIUtils.alert.info(err);
        $scope.fixMembership(); // loop
      });
  };

  /**
   * Catch click for quick fix
   * @param fix
   */
  $scope.doQuickFix = function(event) {
    if (event === 'renew') {
      $scope.renewMembership();
    }
    else if (event === 'fixMembership') {
      $scope.fixMembership();
    }
    else if (event === 'fixIdentity') {
      $scope.fixIdentity();
    }
  };

  /* -- popup / UI -- */

  // Transfer
  $scope.showTransferModal = function() {
    var hasCredit = (!!$scope.walletData.balance && $scope.walletData.balance > 0);
    if (!hasCredit) {
      UIUtils.alert.info('INFO.NOT_ENOUGH_CREDIT');
      return;
    }
    Modals.showTransfer()
      .then(function(done){
        if (done) {
          UIUtils.toast.show('INFO.TRANSFER_SENT');
          $scope.$broadcast('$$rebind::' + 'balance'); // force rebind balance
          $scope.motion.show({selector: '.item-pending'});
        }
      });
  };

  $scope.startWalletTour = function() {
    $scope.hideActionsPopover();
    return $scope.showHelpTip(0, true);
  };

  $scope.showHelpTip = function(index, isTour) {
    index = angular.isDefined(index) ? index : csSettings.data.helptip.wallet;
    isTour = angular.isDefined(isTour) ? isTour : false;
    if (index < 0) return;

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope(isTour);
    if (!helptipScope) return; // could be undefined, if a global tour already is already started
    helptipScope.tour = isTour;

    return helptipScope.startWalletTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        if (!isTour) {
          csSettings.data.helptip.wallet = endIndex;
          csSettings.store();
        }
      });
  };

  $scope.showQRCode = function(id, text, timeout) {
    if (!!$scope.qrcode) {
      return;
    }
    $scope.qrcode = new QRCode(id, {
      text: text,
      width: 200,
      height: 200,
      correctLevel: QRCode.CorrectLevel.L
    });
    UIUtils.motion.toggleOn({selector: '#wallet #'+id+'.qrcode'}, timeout || 1100);
  };

  $scope.showCertifications = function() {
    // Warn: do not use a simple link here (a ng-click is mandatory for help tour)
    $state.go(UIUtils.screen.isSmall() ? 'app.wallet_cert' : 'app.wallet_cert_lg', {
      pubkey: $scope.formData.pubkey,
      uid: $scope.formData.name || $scope.formData.uid,
      type: 'received'
    });
  };

  $scope.showGivenCertifications = function() {
    // Warn: do not use a simple link here (a ng-click is mandatory for help tour)
    $state.go(UIUtils.screen.isSmall() ? 'app.wallet_cert' : 'app.wallet_cert_lg', {
      pubkey: $scope.formData.pubkey,
      uid: $scope.formData.name || $scope.formData.uid,
      type: 'given'
    });
  };

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('templates/wallet/popover_actions.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.actionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.actionsPopover.remove();
        });
        $scope.actionsPopover.show(event);
      });
    }
    else {
      $scope.actionsPopover.show(event);
    }
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

  $scope.showSharePopover = function(event) {
    $scope.hideActionsPopover();

    var title = $scope.formData.name || $scope.formData.uid || $scope.formData.pubkey;

    // Use pod share URL - see issue #69
    var url = esHttp.getUrl('/user/profile/' + $scope.formData.pubkey + '/_share');

    // Override default position, is small screen - fix #25
    if (UIUtils.screen.isSmall()) {
      event = angular.element(document.querySelector('#wallet-share-anchor')) || event;
    }

    UIUtils.popover.share(event, {
      bindings: {
        url: url,
        titleKey: 'WOT.VIEW.POPOVER_SHARE_TITLE',
        titleValues: {title: title},
        postMessage: title
      }
    });
  };

  $scope.showSecurityModal = function(){
    $scope.hideActionsPopover();
    Modals.showAccountSecurity();
  };

}
