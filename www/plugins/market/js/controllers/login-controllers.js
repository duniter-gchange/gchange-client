
angular.module('cesium.market.login.controllers', ['cesium.services'])

  .controller('MarketLoginModalCtrl', MarketLoginModalController)
;

function MarketLoginModalController($scope, $controller, $q, SocialUtils, csConfig, csWallet, mkWallet) {
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

        var isEmail = new RegExp(EMAIL_REGEX).test($scope.formData.username);

        // Add username into socials (with encryption - only admin pubkeys we be able to read it)
        var social = {
            url: $scope.formData.username,
            type: isEmail ? 'email' : 'phone'
        };

        // Add social for the user itself
        var socials = [angular.merge({recipient: data.pubkey}, social)];

        // Add social for admins
        var socials = (adminPubkeys||[]).reduce(function(res, pubkey) {
            return res.concat(angular.merge({recipient: pubkey}, social)) ;
        }, socials);

        // Fill a default profile
        mkWallet.setDefaultProfile({
            socials: socials
        });
    }
    deferred.resolve(data);
    return deferred.promise;
  };
  csWallet.api.data.on.login($scope, $scope.onWalletLogin, this);

}

