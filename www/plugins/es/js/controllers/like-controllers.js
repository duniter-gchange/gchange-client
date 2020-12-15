angular.module('cesium.es.like.controllers', ['ngResource', 'cesium.es.services'])

  .controller('ESLikesCtrl', ESLikesController)
;

function ESLikesController($scope, $q, $timeout, $translate, $ionicPopup, UIUtils, csWallet, esHttp) {
    'ngInject';

    $scope.entered = false;
    $scope.abuseData = {};
    $scope.abuseLevels = [
        {value: 1, label: 'LOW'},
        {value: 2, label: 'LOW'}
    ];
    $scope.staring = false;
    $scope.options = $scope.options || {};
    $scope.options.like = $scope.options.like || {
        kinds: esHttp.constants.like.KINDS,
        index: undefined,
        type: undefined,
        id: undefined
    };

    $scope.$on('$recordView.enter', function(e, state) {
        // First enter
        if (!$scope.entered) {
            $scope.entered = false;
           // Nothing to do: main controller will trigger '$recordView.load' event
        }
        // second call (e.g. if cache)
        else if ($scope.likeData.id) {
            $scope.loadLikes($scope.likeData.id);
        }
    });

    $scope.$on('$recordView.load', function(event, id) {
        $scope.likeData.id = id || $scope.likeData.id;
        if ($scope.likeData.id) {
            $scope.loadLikes($scope.likeData.id);
        }
    });

    // Init Like service
    $scope.initLikes = function() {
      if (!$scope.likeData) {
        throw Error("Missing 'likeData' in scope. Cannot load likes counter");
      }
      if (!$scope.options.like.service) {
        if (!$scope.options.like.index || !$scope.options.like.type) {
          throw Error("Missing 'options.like.index' or 'options.like.type' in scope. Cannot load likes counter");
        }
        $scope.options.like.service = {
          count: esHttp.like.count($scope.options.like.index, $scope.options.like.type),
          add: esHttp.like.add($scope.options.like.index, $scope.options.like.type),
          remove: esHttp.like.remove($scope.options.like.index, $scope.options.like.type),
          toggle: esHttp.like.toggle($scope.options.like.index, $scope.options.like.type)
        };
      }
      if (!$scope.options.like.kinds) {
        // Get scope's kinds (e.g. defined in the parent scope)
        $scope.options.like.kinds = _.filter(esHttp.constants.like.KINDS, function (kind) {
            var key = kind.toLowerCase() + 's';
            return angular.isDefined($scope.likeData[key]);
        });
      }
    };

    $scope.loadLikes = function(id) {
      if ($scope.likeData.loading) return;// Skip

      id = id || $scope.likeData.id;
      $scope.initLikes();

      var kinds = $scope.options.like.kinds || [];
      if (!kinds.length) return; // skip

      $scope.likeData.loading = true;
      var now = Date.now();
      console.debug("[ES] Loading counter of {0}... ({1})".format(id.substring(0,8), kinds));

      return $q.all(_.map(kinds, function(kind) {
          var key = kind.toLowerCase() + 's';
          return $scope.options.like.service.count(id, {issuer: csWallet.isLogin() ? csWallet.data.pubkey : undefined, kind: kind})
            .then(function (res) {
                // Store result to scope
                if ($scope.likeData[key]) {
                    angular.merge($scope.likeData[key], res);
                }
            });
        }))
        .then(function () {
          $scope.likeData.id = id;
          console.debug("[ES] Loading counter of {0} [OK] in {1}ms".format(id.substring(0,8), Date.now()-now));

          if (_.contains(kinds, 'VIEW') && !$scope.canEdit) {
            $scope.markAsView();
          }

          // Publish to parent scope (to be able to use it in action popover's buttons)
          if ($scope.$parent) {
            console.debug("[ES] [likes] Adding data and functions to parent scope");
            $scope.$parent.toggleLike = $scope.toggleLike;
            $scope.$parent.reportAbuse = $scope.reportAbuse;
          }

          $scope.likeData.loading = false;
        })
        .catch(function (err) {
          console.error(err && err.message || err);
          $scope.likeData.loading = false;
        });
    };

    $scope.markAsView = function() {
      if (!$scope.likeData || !$scope.likeData.views || $scope.likeData.views.wasHit) return; // Already view
      var canEdit = $scope.canEdit || $scope.formData && csWallet.isUserPubkey($scope.formData.issuer);
      if (canEdit) return; // User is the record's issuer: skip

      var timer = $timeout(function() {
          if (csWallet.isLogin()) {
              $scope.options.like.service.add($scope.likeData.id, {kind: 'view'}).then(function() {
                  $scope.likeData.views.total = ($scope.likeData.views.total||0) + 1;
              });
          }
          timer = null;
      }, 3000);

      $scope.$on("$destroy", function() {
          if (timer) $timeout.cancel(timer);
      });
    };

    $scope.toggleLike = function(event, options) {
      $scope.initLikes();
      if (!$scope.likeData.id) throw Error("Missing 'likeData.id' in scope. Cannot apply toggle");

      options = options || {};
      options.kind = options.kind && options.kind.toUpperCase() || 'LIKE';
      var key = options.kind.toLowerCase() + 's';

      $scope.likeData[key] = $scope.likeData[key] || {};

      // Avoid too many call
      if ($scope.likeData[key].loading === true || $scope.likeData.loading) {
        event.preventDefault();
        return $q.reject();
      }

      // Like/dislike should be inversed
      if (options.kind === 'LIKE' && $scope.dislikes && $scope.dislikes.wasHit) {
        return $scope.toggleLike(event, {kind: 'dislike'})
          .then(function() {
            $scope.toggleLike(event, options);
          });
      }
      else if (options.kind === 'DISLIKE' && $scope.likes && $scope.likes.wasHit) {
        return $scope.toggleLike(event, {kind: 'LIKE'})
          .then(function() {
            $scope.toggleLike(event, options);
          });
      }

      $scope.likeData[key].loading = true;

      // Make sure user is log in
      return (csWallet.isLogin() ? $q.when() : $scope.loadWallet({minData: true}))
        .then(function() {
          // Apply like
          return $scope.options.like.service.toggle($scope.likeData.id, options);
        })
        .then(function(delta) {
          UIUtils.loading.hide();
          if (delta !== 0) {
            $scope.likeData[key].total = ($scope.likeData[key].total || 0) + delta;
            $scope.likeData[key].wasHit = delta > 0;
          }
          $timeout(function() {
            $scope.likeData[key].loading = false;
          }, 1000);
        })
        .catch(function(err) {
          console.error(err);
          $scope.likeData[key].loading = false;
          UIUtils.loading.hide();
          event.preventDefault();
         });
    };

    $scope.setAbuseForm = function(form) {
        $scope.abuseForm = form;
    };

    $scope.showAbuseCommentPopover = function(event) {
        return $translate(['COMMON.REPORT_ABUSE.TITLE', 'COMMON.REPORT_ABUSE.SUB_TITLE','COMMON.BTN_SEND', 'COMMON.BTN_CANCEL'])
            .then(function(translations) {

                UIUtils.loading.hide();

                return $ionicPopup.show({
                    templateUrl: 'plugins/es/templates/common/popup_report_abuse.html',
                    title: translations['COMMON.REPORT_ABUSE.TITLE'],
                    subTitle: translations['COMMON.REPORT_ABUSE.SUB_TITLE'],
                    cssClass: 'popup-report-abuse',
                    scope: $scope,
                    buttons: [
                        {
                            text: translations['COMMON.BTN_CANCEL'],
                            type: 'button-stable button-clear gray'
                        },
                        {
                            text: translations['COMMON.BTN_SEND'],
                            type: 'button button-positive  ink',
                            onTap: function(e) {
                                $scope.abuseForm.$submitted=true;
                                if(!$scope.abuseForm.$valid || !$scope.abuseData.comment) {
                                    //don't allow the user to close unless he enters a reason
                                    e.preventDefault();
                                } else {
                                    return $scope.abuseData;
                                }
                            }
                        }
                    ]
                });
            })
            .then(function(res) {
                $scope.abuseData = {};
                if (!res || !res.comment) { // user cancel
                    UIUtils.loading.hide();
                    return undefined;
                }
                return res;
            });
    };


    $scope.reportAbuse = function(event, options) {
        if ($scope.likeData && $scope.likeData.abuses && $scope.likeData.abuses.wasHit) return; // Abuse already reported

        options = options || {};

        if (!options.comment) {
            return (csWallet.isLogin() ? $q.when() : $scope.loadWallet({minData: true}))
                // Ask a comment
                .then(function() {
                    return $scope.showAbuseCommentPopover(event);
                })
                // Loop, with options.comment filled
                .then(function(res) {
                    if (!res || !res.comment) return; // Empty comment: skip
                    options.comment = res.comment;
                    options.level = res.level || (res.delete && 5) || undefined;
                    return $scope.reportAbuse(event, options); // Loop, with the comment
                });
        }

        // Send abuse report
        options.kind = 'ABUSE';
        return $scope.toggleLike(event, options)
            .then(function() {
                UIUtils.toast.show('COMMON.REPORT_ABUSE.CONFIRM.SENT');
            });
    };


    $scope.addStar = function(level) {
      if ($scope.starsPopover) {
        return $scope.starsPopover.hide()
          .then(function() {
            $scope.starsPopover = null;
            $scope.addStar(level); // Loop
          });
      }
      if ($scope.likeData.loading || !$scope.likeData.stars || $scope.likeData.stars.loading) return; // Avoid multiple call

      if (!csWallet.isLogin()) {
        return $scope.loadWallet({minData: true})
          .then(function(walletData) {
            if (!walletData) return; // skip
            UIUtils.loading.show();
            // Reload the counter, to known if user already has
            return $scope.options.like.service.count($scope.likeData.id, {issuer: walletData.pubkey, kind: 'STAR'})
              .then(function(stars) {
                  angular.merge($scope.stars, stars);
                  $scope.addStar(level); // Loop
              });
          })
          .catch(function(err) {
            if (err === 'CANCELLED') return; // User cancelled
            // Refresh current like
          });
      }

      $scope.likeData.stars.loading = true;
      var stars = angular.merge(
        {total: 0, levelAvg: 0, levelSum: 0, level: 0, wasHit: false, wasHitId: undefined},
        $scope.likeData.stars);

      var successFunction = function() {
        stars.wasHit = true;
        stars.level = level;
        // Compute AVG (round to near 0.5)
        stars.levelAvg = Math.floor((stars.levelSum / stars.total + 0.5) * 10) / 10 - 0.5;
        // Update the star level
        angular.merge($scope.likeData.stars, stars);
        UIUtils.loading.hide();
      };

      // Already hit: remove previous star, before inserted a new one
      if (stars.wasHitId) {
          console.debug("[ES] Deleting previous star level... " + stars.wasHitId);
          return $scope.options.like.service.remove(stars.wasHitId)
            .catch(function(err) {
                // Not found, so continue
                if (err && err.ucode === 404) return;
                else throw err;
            })
            .then(function() {
                console.debug("[ES] Deleting previous star level [OK]");
                stars.levelSum = stars.levelSum - stars.level + level;
                successFunction();
                // Add the star (after a delay, to make sure deletion has been executed)
                return $timeout(function() {
                    console.debug("[ES] Sending new star level...");
                    return $scope.options.like.service.add($scope.likeData.id, {kind: 'star', level: level || 1});
                }, 2000);
            })
            .then(function(newHitId) {
                stars.wasHitId = newHitId;
                console.debug("[ES] Star level successfully sent... " + newHitId);
                UIUtils.loading.hide();
                return $timeout(function() {
                    $scope.likeData.stars.loading = false;
                }, 1000);
            })
            .catch(function(err) {
                console.error(err && err.message || err);
                $scope.likeData.stars.loading = false;
                UIUtils.onError('MARKET.WOT.ERROR.FAILED_STAR_PROFILE')(err);
                // Reload, to force refresh state
                $scope.loadLikes();
            });
      }

      return $scope.options.like.service.add($scope.likeData.id, {kind: 'star', level: level || 1})
        .then(function(newHitId) {
            stars.levelSum += level;
            stars.wasHitId = newHitId;
            stars.total += 1;
            successFunction();
            console.debug("[ES] Star level successfully sent... " + newHitId);
            $scope.likeData.stars.loading = false;
            UIUtils.loading.hide();
        })
        .catch(function(err) {
            console.error(err && err.message || err);
            $scope.likeData.stars.loading = false;
            UIUtils.onError('MARKET.WOT.ERROR.FAILED_STAR_PROFILE')(err);
        });
    };

  $scope.removeStar = function(event) {
    if ($scope.starsPopover) $scope.starsPopover.hide();
    if ($scope.likeData.loading) return; // Skip
    $scope.likeData.stars.level = undefined;
    $scope.toggleLike(event, {kind: 'star'})
      .then(function() {
          return $timeout(function() {
              $scope.loadLikes(); // refresh
          }, 1000);
      });

  };

  $scope.showStarPopover = function(event) {
    $scope.initLikes();
    if ($scope.likeData.stars.loading) return; // Avoid multiple call

    if (angular.isUndefined($scope.likeData.stars.level)) {
      $scope.likeData.stars.level = 0;
    }

    UIUtils.popover.show(event, {
      templateUrl: 'plugins/es/templates/common/popover_star.html',
      scope: $scope,
      autoremove: true,
      afterShow: function(popover) {
        $scope.starsPopover = popover;
      }
    });
  };

  csWallet.api.data.on.reset($scope, function() {
    _.forEach($scope.options.like.kinds||[], function(kind) {
      var key = kind.toLowerCase() + 's';
      if ($scope.likeData[key]) {
        $scope.likeData[key].wasHit = false;
        $scope.likeData[key].wasHitId = undefined;
        $scope.likeData[key].level = undefined;
      }
    });
    $scope.$broadcast('$$rebind::like'); // notify binder
  }, this);

}
