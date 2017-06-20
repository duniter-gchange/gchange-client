
angular.module('cesium.market.login.controllers', ['cesium.services'])

  .controller('MarketLoginModalCtrl', MarketLoginModalController)
;

function MarketLoginModalController($scope, $controller) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('LoginModalCtrl', {$scope: $scope}));

  var EMAIL_REGEX = '^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$';
  var PHONE_NUMBER_REGEX = '^[0-9]{9,10}$';
  $scope.usernamePattern = EMAIL_REGEX + '|' + PHONE_NUMBER_REGEX;
}

