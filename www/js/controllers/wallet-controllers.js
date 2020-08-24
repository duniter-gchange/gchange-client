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
                          UIUtils, csWallet, $ionicPopover, Modals, csSettings,
                          esHttp) {
  'ngInject';

  $scope.loading = true;
  $scope.settings = csSettings.data;
  $scope.qrcodeId = 'qrcode-wallet-' + $scope.$id;
  $scope.toggleQRCode = false;
  $scope.likeData = {
    views: {},
    likes: {},
    follows: {},
    abuses: {},
    stars: {}
  };

  $scope.enter = function(e, state) {
    $scope.loading = $scope.loading || (state.stateParams && state.stateParams.refresh);

    if ($scope.loading) { // load once

      // Remove consumed query params
      $scope.cleanLocationHref(state);

      return $scope.load();
    }
    else {
      // update view (to refresh avatar + plugin data, such as profile, subscriptions...)
      UIUtils.loading.hide(10);
      $timeout($scope.updateView, 300);
    }
    $scope.$broadcast('$recordView.enter', state);
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.load = function() {
    return $scope.loadWallet()
      .then(function(walletData) {
        $scope.formData = walletData;
        $scope.loading=false; // very important, to avoid TX to be display before wallet.currentUd is loaded
        $scope.updateView();
        $scope.addListeners();

        //$scope.showQRCode();
        UIUtils.loading.hide(10); // loading could have be open (e.g. new account)
      })
      .catch(function(err){
        if (err === 'CANCELLED') {
          $scope.showHome();
          return;
        }
        UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR')(err);
      });
  };

  $scope.updateView = function() {
    $scope.motion.show({selector: '#wallet .item'});
    $scope.$broadcast('$$rebind::rebind'); // force rebind
  };


  $scope.setRegisterForm = function(registerForm) {
    $scope.registerForm = registerForm;
  };

  // Clean controller data when logout
  $scope.onWalletLogout = function() {
    // clean QRcode
    $scope.hideQRCode();
    $scope.removeListeners();
    delete $scope.formData;
    $scope.loading = true;
  };

  $scope.addListeners = function() {
    $scope.listeners = [
      // Reset the view on logout
      csWallet.api.data.on.logout($scope, $scope.onWalletLogout),

      // Listen new events (can appears from security wizard also)
      $scope.$watchCollection('formData.events', function(newEvents, oldEvents) {
        if (!oldEvents || $scope.loading || angular.equals(newEvents, oldEvents)) return;
        $scope.updateView();
      })
    ];
  };

  $scope.removeListeners = function() {
    _.forEach($scope.listeners, function(remove){
      remove();
    });
    $scope.listeners = [];
  };

  // Updating wallet data
  $scope.doUpdate = function(silent) {
    console.debug('[wallet] Updating wallet...');
    return (silent ?
      csWallet.refreshData() :
      UIUtils.loading.show()
        .then(csWallet.refreshData)
        .then(UIUtils.loading.hide)
    )
      .then($scope.updateView)
      .catch(UIUtils.onError('ERROR.REFRESH_WALLET_DATA'));
  };



  /**
   * Catch click for quick fix
   * @param event
   */
  $scope.doQuickFix = function(event) {
    console.log("TODO doQuickFix:", event);
  };

  /* -- popup / UI -- */

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
    if (!$scope.qrcodeId) return;
    // Get the DIV element
    var element = angular.element(document.querySelector('#' + $scope.qrcodeId + ' .content'));
    if (!element) {
      console.error("[wallet-controller] Cannot found div #{0} for the QRCode. Skipping.".format($scope.qrcodeId));
      return;
    }

    return csWallet.loadQrCode()
      .then(function(svg) {
        element.html(svg);
        UIUtils.motion.toggleOn({selector: '#'+$scope.qrcodeId}, timeout || 1100);
      });
  };

  $scope.hideQRCode = function() {
    if (!$scope.qrcodeId) return;
    var element = angular.element(document.querySelector('#' + $scope.qrcodeId));
    if (element) {
      UIUtils.motion.toggleOff({selector: '#'+$scope.qrcodeId});
    }
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
      $scope.actionsPopover = null;
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

  // remove '?refresh' from the location URI
  $scope.cleanLocationHref = function(state) {
    if (state && state.stateParams && state.stateParams.refresh) {
      $timeout(function() {
        var stateParams = angular.copy(state.stateParams);
        delete stateParams.refresh;
        $location.search(stateParams).replace();
      }, 300);
    }
  };
}
