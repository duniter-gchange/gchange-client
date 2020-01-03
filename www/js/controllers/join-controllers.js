
angular.module('cesium.join.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider
      .state('app.join', {
        url: "/join",
        views: {
          'menuContent': {
            templateUrl: "templates/home/home.html",
            controller: 'JoinCtrl'
          }
        }
      })
    ;
  })

  .controller('JoinCtrl', JoinController)

  .controller('JoinModalCtrl', JoinModalController)

;



function JoinController($timeout, Modals) {
  'ngInject';

  // Open join modal
  $timeout(function() {
    Modals.showJoin();
  }, 100);

}


function JoinModalController($scope, $state,  UIUtils, CryptoUtils, csSettings, Modals, csWallet, mkWallet, BMA) {
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
  $scope.search = {
    looking: true
  };
  $scope.showUsername = false;
  $scope.showPassword = false;
  $scope.smallscreen = UIUtils.screen.isSmall();
  $scope.userIdPattern = BMA.constants.regex.USER_ID;

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
    $scope.formData.computing=true;
     CryptoUtils.scryptKeypair($scope.formData.username, $scope.formData.password)
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
    console.debug("[join] form " + formName + " OK. index=" + $scope.slides.slider.activeIndex);
    if (!formName) {
      formName = ($scope.slides.slider.activeIndex === 1 ? 'passwordForm' : ($scope.slides.slider.activeIndex === 2 ? 'pseudoForm' : formName));
    }
    if (formName) {
      $scope[formName].$submitted=true;
      if(!$scope[formName].$valid) {
        return;
      }
      if (formName === 'passwordForm') {
        $scope.slideNext();
        $scope.showAccountPubkey();
      }
      else {
        $scope.slideNext();
        if (formName === 'pseudoForm') {
          $scope.showAccountPubkey();
        }
      }
    }
  };

  $scope.doNewAccount = function(confirm) {

    if (!confirm) {
      return UIUtils.alert.confirm('ACCOUNT.NEW.CONFIRMATION_WALLET_ACCOUNT')
        .then(function(confirm) {
          if (confirm) {
            $scope.doNewAccount(true);
          }
        });
    }

    UIUtils.loading.show();

    csWallet.login($scope.formData.username, $scope.formData.password)
    .then(function(data) {
      $scope.closeModal();
      csSettings.data.wallet = csSettings.data.wallet || {};
      csSettings.data.wallet.alertIfUnusedWallet = false; // do not alert if empty
      // Fill a default profile
      mkWallet.setDefaultProfile({
        title: $scope.formData.pseudo
      });
      // Redirect to wallet
      $state.go('app.view_wallet');
    })
    .catch(function(err) {
      UIUtils.loading.hide();
      console.error('>>>>>>>' , err);
      UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
    });
  };

  $scope.showHelpModal = function(helpAnchor) {
    if (!helpAnchor) {
      helpAnchor = $scope.slides.slider.activeIndex == 1 ?
        'join-salt' : ( $scope.slides.slider.activeIndex == 2 ?
          'join-password' : 'join-pseudo');
    }
    Modals.showHelp({anchor: helpAnchor});
  };

  // TODO: remove auto add account when done
  /*$timeout(function() {
    $scope.formData.username="azertypoi";
    $scope.formData.confirmUsername=$scope.formData.username;
    $scope.formData.password="azertypoi";
    $scope.formData.confirmPassword=$scope.formData.password;
    $scope.formData.pseudo="azertypoi";
    $scope.doNext();
    $scope.doNext();
    //$scope.form = {$valid:true};
  }, 2000);*/
}
