angular.module('cesium.market.wot.controllers', ['cesium.es.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider.extendStates(['app.wot_identity', 'app.wot_identity_uid'], {
          points: {
              'buttons': {
                  templateUrl: "plugins/market/templates/wot/view_identity_extend.html",
                  controller: 'MkWotIdentityExtendCtrl'
              },
              'general': {
                  templateUrl: "plugins/market/templates/wot/view_identity_extend.html",
                  controller: 'MkWotIdentityExtendCtrl'
              },
              'after-general': {
                  templateUrl: "plugins/market/templates/wot/view_identity_extend.html",
                  controller: 'MkWotIdentityExtendCtrl'
              }
          }
      })
      ;
    }

    $stateProvider

      .state('app.market_identity_records', {
          url: "/market/records/:pubkey",
          views: {
             'menuContent': {
                templateUrl: "plugins/market/templates/wot/view_identity_records.html",
                controller: 'MkIdentityRecordsCtrl'
              }
          }
       })
  })

 .controller('MkWotIdentityExtendCtrl', MkWotIdentityExtendController)

  .controller('MkIdentityRecordsCtrl', MkIdentityRecordsController)

;

function MkWotIdentityExtendController($scope, $controller, $ionicPopover, $timeout, PluginService, UIUtils, csWallet, esSettings, esModals, esProfile) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESExtensionCtrl', {$scope: $scope}));

  $scope.stars = {};
  $scope.staring = false;

  $scope.addStar = function(level) {
      if ($scope.starsPopover) {
          return $scope.starsPopover.hide()
              .then(function() {
                  $scope.starsPopover = null;
                  $scope.addStar(level); // Loop
              })
      }
      if ($scope.staring) return; // Avoid multiple call

      if (!csWallet.isLogin()) {
          return $scope.loadWallet({minData: true})
              .then(function(walletData) {
                  if (!walletData) return; // skip
                  UIUtils.loading.show();
                  // Reload the counter, to known if user already has
                  return esProfile.like.count($scope.formData.pubkey, {issuer: walletData.pubkey, kind: 'STAR'})
                      .then(function(stars) {
                          $scope.formData.stars = stars;
                          $scope.addStar(level); // Loop
                      })
              })
              .catch(function(err) {
                  if (err === 'CANCELLED') return; // User cancelled
                  // Refresh current like

              });
      }


      $scope.staring = true;
      var stars = angular.merge(
          {total: 0, levelAvg: 0, levelSum: 0, level: 0, wasHit: false, wasHitId: undefined},
          $scope.formData.stars);

      var successFunction = function() {
          stars.wasHit = true;
          stars.level = level;
          // Compute AVG (round to near 0.5)
          stars.levelAvg = Math.floor((stars.levelSum / stars.total + 0.5) * 10) / 10 - 0.5;
          // Update the star level
          $scope.formData.stars = stars;
      };

      // Already hit: remove previous star, before inserted a new one
      if (stars.wasHitId) {
          console.debug("[ES] Deleting previous star level... " + stars.wasHitId);
          return esProfile.like.remove(stars.wasHitId)
             .then(function() {
                  console.debug("[ES] Deleting previous star level [OK]");
                  stars.levelSum = stars.levelSum - stars.level + level;
                  successFunction();
                  // Add the star (after a delay, to make sure deletion has been executed)
                  return $timeout(function() {
                      console.debug("[ES] Sending new star level...");
                      return esProfile.like.add($scope.formData.pubkey, {kind: 'star', level: level || 1});
                  }, 1000);
              })
              .then(function(newHitId) {
                  stars.wasHitId = newHitId;
                  console.debug("[ES] Star level successfully sent... " + newHitId);
                  $scope.staring = false;
                  UIUtils.loading.hide();
              })
              .catch(function(err) {
                  console.error(err && err.message || err);
                  $scope.staring = false;
                  UIUtils.onError('MARKET.WOT.ERROR.FAILED_STAR_PROFILE')(err);
              });
      }

    return esProfile.like.add($scope.formData.pubkey, {kind: 'star', level: level || 1})
      .then(function(newHitId) {
          stars.levelSum += level;
          stars.wasHitId = newHitId;
          stars.total += 1;
          successFunction();
          console.debug("[ES] Star level successfully sent... " + newHitId);
          $scope.staring = false;
          UIUtils.loading.hide();
        })
        .catch(function(err) {
            console.error(err && err.message || err);
            $scope.staring = false;
            UIUtils.onError('MARKET.WOT.ERROR.FAILED_STAR_PROFILE')(err);
        });
  };

    $scope.showStarPopover = function(event) {
        if ($scope.staring) return; // Avoid multiple call

        if (angular.isUndefined($scope.formData.stars.level)) {
            $scope.formData.stars.level = 0;
        }

        if (!$scope.starsPopover) {
            $ionicPopover.fromTemplateUrl('plugins/es/templates/common/popover_star.html', {
                scope: $scope
            }).then(function(popover) {
                $scope.starsPopover = popover;
                //Cleanup the popover when we're done with it!
                $scope.$on('$destroy', function() {
                    $scope.starsPopover.remove();
                });
                $scope.starsPopover.show(event);
            });
        }
        else {
            $scope.starsPopover.show(event);
        }
    };

  $scope.showNewMessageModal = function() {
    return $scope.loadWallet({minData: true})

      // Open modal
      .then(function(walletData) {
        $scope.walletData = walletData;
        return esModals.showMessageCompose({
          destPub: $scope.formData.pubkey,
          destUid: $scope.formData.name||$scope.formData.uid
        })
        .then(function(sent) {
          if (sent) UIUtils.toast.show('MESSAGE.INFO.MESSAGE_SENT');
        });
      });
  };

    csWallet.api.data.on.reset($scope, function() {
        $scope.formData.stars.wasHit = false;
        $scope.formData.stars.wasHitId = undefined;
        $scope.formData.stars.level = undefined;
    }, this);
}


function MkIdentityRecordsController($scope, $controller, UIUtils) {

    // Initialize the super class and extend it.
    angular.extend(this, $controller('MkLookupAbstractCtrl', {$scope: $scope}));

    $scope.smallscreen = UIUtils.screen.isSmall();

    $scope.enter = function(e, state) {
        $scope.pubkey = state && state.stateParams && state.stateParams.pubkey;
        if (!$scope.pubkey) return $scope.showHome();

        $scope.search.text = $scope.pubkey;
        $scope.search.lastRecords=false;

        $scope.doSearch();
        $scope.entered = true;
    };
    $scope.$on('$ionicView.enter', $scope.enter);

}
