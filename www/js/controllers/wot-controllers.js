angular.module('cesium.wot.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider

      .state('app.wot_lookup', {
        url: "/wot?q&type&hash",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/lookup.html",
            controller: 'WotLookupCtrl'
          }
        }
      })

      .state('app.wot_identity', {
        url: "/wot/:pubkey/:uid?action",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_identity.html",
            controller: 'WotIdentityViewCtrl'
          }
        }
      })

      .state('app.wot_identity_uid', {
        url: "/lookup/:uid?action",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_identity.html",
            controller: 'WotIdentityViewCtrl'
          }
        }
      });
  })

  .controller('WotLookupCtrl', WotLookupController)

  .controller('WotLookupModalCtrl', WotLookupModalController)

  .controller('WotIdentityAbstractCtrl', WotIdentityAbstractController)

  .controller('WotIdentityViewCtrl', WotIdentityViewController)


;

function WotLookupController($scope, $state, $timeout, $focus, $ionicPopover, $ionicHistory,
                             UIUtils, csConfig, csCurrency, csSettings, Device, BMA, csWallet, esDocument, esProfile) {
  'ngInject';

  var defaultSearchLimit = 10;

  $scope.search = {
    text: '',
    loading: true,
    type: null,
    results: []
  };
  $scope._source = ["issuer", "title", "city", "time", "avatar._content_type"];
  $scope.entered = false;
  $scope.wotSearchTextId = 'wotSearchText';
  $scope.enableFilter = true;
  $scope.allowMultiple = false;
  $scope.selection = [];
  $scope.showResultLabel = true;
  $scope.parameters = {}; // override in the modal controller

  $scope.enter = function(e, state) {
    if (!$scope.entered) {
      if (state.stateParams && state.stateParams.q) { // Query parameter
        $scope.search.text = state.stateParams.q;
        $timeout(function() {
          $scope.doSearch();
        }, 100);
      }
      else if (state.stateParams && state.stateParams.hash) { // hash tag parameter
        $scope.search.text = '#' + state.stateParams.hash;
        $timeout(function() {
          $scope.doSearch();
        }, 100);
      }
      else {
        $timeout(function() {
          // get new comers
          if (state.stateParams.type === 'newcomers' || (!csConfig.initPhase && !state.stateParams.type)) {
            $scope.doGetNewcomers(0, undefined, true/*skipLocationUpdate*/);
          }

        }, 100);
      }
      // removeIf(device)
      // Focus on search text (only if NOT device, to avoid keyboard opening)
      $focus($scope.wotSearchTextId);
      // endRemoveIf(device)

      $scope.entered = true;

      $timeout(UIUtils.ink, 100);

      $scope.showHelpTip();
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.resetWotSearch = function() {
    $scope.search = {
      text: null,
      loading: false,
      type: 'newcomers',
      results: []
    };
  };

  $scope.updateLocationHref = function() {
    // removeIf(device)
    var stateParams = {
      q: undefined,
      hash: undefined,
      type: undefined
    };

    if ($scope.search.type === 'text') {
      var text = $scope.search.text.trim();
      if (text.match(/^#[\wḡĞǦğàáâãäåçèéêëìíîïðòóôõöùúûüýÿ]+$/)) {
        stateParams.hash = text.substr(1);
      }
      else {
        stateParams.q = text;
      }
    }
    else {
      stateParams.type = $scope.search.type;
    }

    // Update location href
    $ionicHistory.nextViewOptions({
      disableAnimate: true,
      disableBack: true,
      historyRoot: true
    });
    $state.go('app.wot_lookup', stateParams,
      {
        reload: false,
        inherit: true,
        notify: false
      });
    // endRemoveIf(device)
  };

  $scope.doSearchText = function() {

    $scope.doSearch();
    $scope.updateLocationHref();

    // removeIf(no-device)
    Device.keyboard.close();
    // endRemoveIf(no-device)
  };

  $scope.doSearch = function(offset, size) {
    var text = $scope.search.text.trim();
    if ((UIUtils.screen.isSmall() && text.length < 3) || !text.length) {
      $scope.search.results = [];
      $scope.search.type = 'none';
      return $q.when();
    }
    $scope.search.loading = true;
    var options = {
      from: offset || 0,
      size: size || defaultSearchLimit,
      _source: $scope._source
    };
    $scope.search.type = 'text';
    return esProfile.searchText(text, options)
      .then(function(idties){
        if ($scope.search.type !== 'text') return; // could have change
        if ($scope.search.text.trim() !== text) return; // search text has changed before received response

        if ((!idties || !idties.length) && BMA.regexp.PUBKEY.test(text)) {
          $scope.doDisplayResult([{pubkey: text}]);
        }
        else {
          $scope.doDisplayResult(idties, offset, size);
        }
      })
      .catch(UIUtils.onError('ERROR.WOT_LOOKUP_FAILED'));
  };

  $scope.doGetNewcomers = function(offset, size, skipLocationUpdate) {
    offset = offset || 0;
    size = size || defaultSearchLimit;
    if (size < defaultSearchLimit) size = defaultSearchLimit;

    $scope.hideActionsPopover();
    $scope.search.loading = (offset === 0);
    $scope.search.type = 'newcomers';

    // Update location href
    if (!offset && !skipLocationUpdate) {
      $scope.updateLocationHref();
    }

    var options = {
      index: 'user',
      type: 'profile',
      from: offset,
      size: size,
      sort: {time: 'desc'}
    };

    return esProfile.search(options)
      .then(function(idties){
        if ($scope.search.type !== 'newcomers') return false; // could have change
        $scope.doDisplayResult(idties, offset, size);
        return true;
      })
      .catch(function(err) {
        $scope.search.loading = false;
        $scope.search.results = (offset > 0) ? $scope.search.results : [];
        $scope.search.hasMore = false;
        UIUtils.onError('ERROR.LOAD_NEWCOMERS_FAILED')(err);
      });
  };

  $scope.showMore = function() {
    var offset = $scope.search.results ? $scope.search.results.length : 0;

    $scope.search.loadingMore = true;
    var searchFunction = ($scope.search.type === 'newcomers') ?
      $scope.doGetNewcomers :
      $scope.doGetPending;

    return searchFunction(offset)
      .then(function(ok) {
        if (ok) {
          $scope.search.loadingMore = false;
          $scope.$broadcast('scroll.infiniteScrollComplete');
        }
      })
      .catch(function(err) {
        console.error(err);
        $scope.search.loadingMore = false;
        $scope.search.hasMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };

  $scope.select = function(identity) {
    // identity = self -> open the user wallet
    if (csWallet.isUserPubkey(identity.pubkey)) {
      $state.go('app.view_wallet');
    }
    // Open identity view
    else {
      $state.go('app.wot_identity', {
        pubkey: identity.pubkey,
        uid: identity.uid
      });
    }
  };

  $scope.next = function() {
    // This method should be override by sub controller (e.g. modal controller)
    console.log('Selected identities:', $scope.selection);
  };

  $scope.toggleCheck = function(index, e) {
    var identity = $scope.search.results[index];
    if (identity.checked) {
      $scope.addToSelection(identity);
    }
    else {
      $scope.removeSelection(identity, e);
    }
  };

  $scope.toggleSelect = function(identity){
    identity.selected = !identity.selected;
  };

  $scope.addToSelection = function(identity) {

    var copyIdty = angular.copy(identity);
    if (copyIdty.name) {
      copyIdty.name = copyIdty.name.replace('<em>', '').replace('</em>', ''); // remove highlight
    }

    $scope.selection.push(copyIdty);
  };

  $scope.removeSelection = function(identity, e) {

    // Remove from selection array
    var identityInSelection = _.findWhere($scope.selection, {id: identity.id});
    if (identityInSelection) {
      $scope.selection.splice($scope.selection.indexOf(identityInSelection), 1);
    }

    // Uncheck in result array, if exists
    if (!$scope.search.loading) {
      var existIdtyInResult = _.findWhere($scope.search.results, {id: identity.id});
      if (existIdtyInResult && existIdtyInResult.checked) {
        existIdtyInResult.checked = false;
      }
    }
    //e.preventDefault();
  };

  $scope.scanQrCode = function(){
    if (!Device.barcode.enable) {
      return;
    }
    Device.barcode.scan()
      .then(function(result) {
        if (!result) {
          return;
        }
        BMA.uri.parse(result)
          .then(function(obj){
            if (obj.pubkey) {
              $scope.search.text = obj.pubkey;
            }
            else if (result.uid) {
              $scope.search.text = obj.uid;
            }
            else {
              $scope.search.text = result;
            }
            $scope.doSearch();
          });
      })
      .catch(UIUtils.onError('ERROR.SCAN_FAILED'));
  };

  // Show help tip (show only not already shown)
  $scope.showHelpTip = function() {
    if (!$scope.isLogin()) return;
    var index = angular.isDefined(index) ? index : csSettings.data.helptip.wot;
    if (index < 0) return;
    if (index === 0) index = 1; // skip first step

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope();
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    return helptipScope.startWotTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        csSettings.data.helptip.wot = endIndex;
        csSettings.store();
      });
  };

  $scope.doDisplayResult = function(res, offset, size) {
    res = res || {};

    // pre-check result if already in selection
    if ($scope.allowMultiple && res.length && $scope.selection.length) {
      _.forEach($scope.selection, function(identity) {
        var identityInRes = _.findWhere(res, {id: identity.id});
        if (identityInRes) {
          identityInRes.checked = true;
        }
      });
    }

    if (!offset) {
      $scope.search.results = res || [];
    }
    else {
      $scope.search.results = $scope.search.results.concat(res);
    }
    $scope.search.loading = false;
    $scope.search.hasMore = res.length && $scope.search.results.length >= (offset + size);

    $scope.smallscreen = UIUtils.screen.isSmall();

    if (!$scope.search.results.length) return;

    // Motion
    if (res.length > 0 && $scope.motion) {
      $scope.motion.show({selector: '.lookupForm .list .item', ink: true});
    }
  };

  /* -- show/hide popup -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('templates/wot/lookup_popover_actions.html', {
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

}

function WotLookupModalController($scope, $controller, $focus, parameters){
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('WotLookupCtrl', {$scope: $scope}));

  parameters = parameters || {};
  $scope.search.loading = false;
  $scope.enableFilter = angular.isDefined(parameters.enableFilter) ? parameters.enableFilter : false;
  $scope.allowMultiple = angular.isDefined(parameters.allowMultiple) ? parameters.allowMultiple : false;
  $scope.parameters = parameters;
  $scope.showResultLabel = false;

  $scope.wotSearchTextId = 'wotSearchTextModal';

  if ($scope.allowMultiple && parameters.selection) {
    $scope.selection = parameters.selection;
  }

  $scope.cancel = function(){
    $scope.closeModal();
  };

  $scope.select = function(identity){
    $scope.closeModal({
      pubkey: identity.pubkey,
      uid: identity.uid,
      name: identity.name && identity.name.replace(/<\/?em>/ig, '')
    });
  };

  $scope.next = function() {
    $scope.closeModal($scope.selection);
  };

  $scope.updateLocationHref = function() {
    // Do NOT change location href
  };

  $scope.showHelpTip = function() {
    // silent
  };

  // removeIf(device)
  // Focus on search text (only if NOT device, to avoid keyboard opening)
  $focus($scope.wotSearchTextId);
  // endRemoveIf(device)
}

/**
 * Abtract controller that load identity, that expose some useful methods in $scope, like 'certify()'
 * @param $scope
 * @param $state
 * @param $timeout
 * @param UIUtils
 * @param Modals
 * @param csConfig
 * @param csWot
 * @param csWallet
 * @constructor
 */
function WotIdentityAbstractController($scope, $rootScope, $state, $translate, $ionicHistory,
                                       UIUtils, Modals, esHttp, csCurrency, csWot, csWallet) {
  'ngInject';

  $scope.formData = {
    hasSelf: true
  };
  $scope.disableCertifyButton = true;
  $scope.loading = true;

  $scope.load = function(pubkey, withCache, uid) {
    return csWot.load(pubkey, withCache, uid)
      .then(function(identity){
        if (!identity) return UIUtils.onError('ERROR.IDENTITY_NOT_FOUND')().then($scope.showHome);
        $scope.formData = identity;
        $scope.revoked = identity.requirements && (identity.requirements.revoked || identity.requirements.pendingRevocation);
        $scope.canCertify = identity.hasSelf && (!csWallet.isLogin() || (!csWallet.isUserPubkey(pubkey))) && !$scope.revoked;
        $scope.canSelectAndCertify = identity.hasSelf && csWallet.isUserPubkey(pubkey);
        $scope.alreadyCertified = !$scope.canCertify || !csWallet.isLogin() ? false :
          (!!_.findWhere(identity.received_cert, { pubkey: csWallet.data.pubkey, valid: true }) ||
            !!_.findWhere(identity.received_cert_pending, { pubkey: csWallet.data.pubkey, valid: true }));
        $scope.disableCertifyButton = $scope.alreadyCertified || $scope.revoked;
        $scope.loading = false;
      })
      .catch(function(err) {
        $scope.loading = false;
        UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED')(err);
      });
  };

  $scope.removeActionParamInLocationHref = function(state) {
    if (!state || !state.stateParams || !state.stateParams.action) return;

    var stateParams = angular.copy(state.stateParams);

    // Reset action param
    stateParams.action = null;

    // Update location href
    $ionicHistory.nextViewOptions({
      disableAnimate: true,
      disableBack: false,
      historyRoot: false
    });
    $state.go(state.stateName, stateParams,
      {
        reload: false,
        inherit: true,
        notify: false
      });
  };

  /* -- open screens -- */

  $scope.showSharePopover = function(event) {
    var title = $scope.formData.name || $scope.formData.uid || $scope.formData.pubkey;
    // Use pod share URL - see issue #69
    var url = esHttp.getUrl('/user/profile/' + $scope.formData.pubkey + '/_share');

    // Override default position, is small screen - fix #25
    if (UIUtils.screen.isSmall()) {
      event = angular.element(document.querySelector('#wot-share-anchor-'+$scope.formData.pubkey)) || event;
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
}

/**
 * Identity view controller - should extend WotIdentityAbstractCtrl
 */
function WotIdentityViewController($scope, $rootScope, $controller, $timeout, UIUtils, csWallet) {
  'ngInject';
  // Initialize the super class and extend it.
  angular.extend(this, $controller('WotIdentityAbstractCtrl', {$scope: $scope}));

  $scope.motion = UIUtils.motion.fadeSlideInRight;

  // Init likes here, to be able to use in extension
  $scope.options = $scope.options || {};
  $scope.options.like = {
    kinds: ['VIEW', 'LIKE', 'ABUSE', 'FOLLOW', 'STAR'],
    index: 'user',
    type: 'profile'
  };
  $scope.likeData = {
    views: {},
    likes: {},
    follows: {},
    abuses: {},
    stars: {}
  };

  $scope.$on('$ionicView.enter', function(e, state) {

    var onLoadSuccess = function() {
      $scope.doMotion();
      if (state.stateParams && state.stateParams.action) {
        $timeout(function() {
          $scope.doAction(state.stateParams.action.trim());
        }, 100);

        $scope.removeActionParamInLocationHref(state);

        $scope.likeData.id = $scope.formData.pubkey;
      }
    };

    if (state.stateParams &&
      state.stateParams.pubkey &&
      state.stateParams.pubkey.trim().length > 0) {
      if ($scope.loading) { // load once
        return $scope.load(state.stateParams.pubkey.trim(), true /*withCache*/, state.stateParams.uid)
          .then(onLoadSuccess);
      }
    }

    else if (state.stateParams &&
      state.stateParams.uid &&
      state.stateParams.uid.trim().length > 0) {
      if ($scope.loading) { // load once
        return $scope.load(null, true /*withCache*/, state.stateParams.uid)
          .then(onLoadSuccess);
      }
    }

    // Load from wallet pubkey
    else if (csWallet.isLogin()){

      if ($scope.loading) {
        return $scope.load(csWallet.data.pubkey, true /*withCache*/, csWallet.data.uid)
          .then(onLoadSuccess);
      }
    }

    // Redirect to home
    else {
      $scope.showHome();
    }

  });

  $scope.doMotion = function() {
    $scope.motion.show({selector: '.view-identity .list .item'});

    $scope.$broadcast('$csExtension.motion');
  };


}
