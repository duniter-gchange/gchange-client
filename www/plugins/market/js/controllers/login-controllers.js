
angular.module('cesium.market.login.controllers', ['cesium.services'])

  .controller('MarketLoginModalCtrl', MarketLoginModalController)
;

function MarketLoginModalController($scope, $controller, $q, SocialUtils, csConfig, csWallet) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('LoginModalCtrl', {$scope: $scope}));

  var EMAIL_REGEX = '^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$';
  var PHONE_NUMBER_REGEX = '^[0-9]{9,10}$';
  $scope.usernamePattern = EMAIL_REGEX + '|' + PHONE_NUMBER_REGEX;

  $scope.onWalletLogin = function(data, deferred) {
    deferred = deferred || $q.defer();
    // Give the username to mkUser service,
    // to store it inside the user profile

    var adminPubkeys = csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.defaultAdminPubkeys;
    if (adminPubkeys.length) {
        console.error("[market] [login] Storing username into user profile socials");
        data.profile = data.profile || {};
        data.profile.socials = data.profile.socials || [];

        // Add username into socials (with encryption - only admin pubkeys we be able to read it)
        data.profile.socials = adminPubkeys.reduce(function(res, pubkey) {
           return res.concat(SocialUtils.createForEncryption(pubkey, 'contact: ' + $scope.formData.username)) ;
        }, data.profile.socials);
    }
    deferred.resolve(data);
    return deferred.promise;
  };
  csWallet.api.data.on.login($scope, $scope.onWalletLogin, this);

}

