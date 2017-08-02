
angular.module('cesium.market.join.controllers', ['cesium.services', 'cesium.market.services'])

  .controller('MkJoinModalCtrl', function ($scope, $timeout, $state,  UIUtils, CryptoUtils, csSettings, csWallet, csCurrency, mkWallet, mkModals) {
  'ngInject';

  $scope.formData = {
    pseudo: ''
  };
  $scope.slides = {
    slider: null,
    options: {
      loop: false,
      effect: 'slide',
      speed: 500
    }
  };
  $scope.isLastSlide = false;
  $scope.showUsername = false;
  $scope.showPassword = false;
  $scope.smallscreen = UIUtils.screen.isSmall();

  $scope.enter = function() {
    csCurrency.get().then(function(currency) {
      $scope.currency = currency;
    })
  };
  $scope.$on('modal.shown', $scope.enter);

  $scope.slidePrev = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slidePrev();
    $scope.slides.slider.lockSwipes();
    $scope.isLastSlide = false;
  };

  $scope.slideNext = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slideNext();
    $scope.slides.slider.lockSwipes();
    $scope.isLastSlide = $scope.slides.slider.activeIndex === 4;
  };


  $scope.showAccountPubkey = function() {
    if ($scope.formData.pubkey) return; // not changed

    $scope.formData.computing=true;
    CryptoUtils.connect($scope.formData.username, $scope.formData.password)
      .then(function(keypair) {
        $scope.formData.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
        $scope.formData.computing=false;
      })
      .catch(function(err) {
        $scope.formData.computing=false;
        console.error('>>>>>>>' , err);
        UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
      });
  };

  $scope.formDataChanged = function() {
    $scope.formData.computing=false;
    $scope.formData.pubkey=null;
  };

  $scope.doNext = function(formName) {
    if (!formName) {
      switch($scope.slides.slider.activeIndex) {
        case 0:
          formName = 'saltForm';
          break;
        case 1:
          formName = 'passwordForm';
          break;
        case 2:
          formName = 'profileForm';
          break;
      }
    }
    if (formName) {
      $scope[formName].$submitted=true;
      if(!$scope[formName].$valid) {
        return;
      }
      if (formName === 'passwordForm' || formName === 'pseudoForm') {
        $scope.slideNext();
        $scope.showAccountPubkey();
      }
      else {
        $scope.slideNext();
      }
    }
  };

  $scope.doNewAccount = function(confirm) {

    if (!confirm) {
      return UIUtils.alert.confirm('MARKET.JOIN.CONFIRMATION_WALLET_ACCOUNT')
        .then(function(confirm) {
          if (confirm) {
            $scope.doNewAccount(true);
          }
        });
    }

    UIUtils.loading.show();

    // Fill a default profile
    mkWallet.setDefaultProfile({
      title: $scope.formData.title,
      description: $scope.formData.description
    });

    // do not alert use if wallet is empty
    csSettings.data.wallet = csSettings.data.wallet || {};
    csSettings.data.wallet.alertIfUnusedWallet = false;

    // Apply login (will call profile creation)
    return csWallet.login($scope.formData.username, $scope.formData.password)
      .catch(UIUtils.onError('ERROR.CRYPTO_UNKNOWN_ERROR'))
      // Close the join current
      .then($scope.closeModal)
      // Redirect to wallet
      .then(function() {
        return $state.go('app.view_wallet');
      });
  };

  $scope.showHelpModal = function(helpAnchor) {
    if (!helpAnchor) {
      helpAnchor = $scope.slides.slider.activeIndex == 1 ?
        'join-salt' : ( $scope.slides.slider.activeIndex == 2 ?
          'join-password' : undefined);
    }
    return mkModals.showHelp({anchor: helpAnchor});
  };

  // TODO: remove auto add account when done
  $timeout(function() {
    $scope.formData.username="azertypoi";
    $scope.formData.confirmUsername=$scope.formData.username;
    $scope.formData.password="azertypoi";
    $scope.formData.confirmPassword=$scope.formData.password;
    $scope.formData.pseudo="azertypoi";
    $scope.doNext();
    $scope.doNext();
  }, 400);
});