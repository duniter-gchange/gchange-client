angular.module('cesium.market.wallet.services', ['cesium.es.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.market;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('mkWallet');
    }

  })

.factory('mkWallet', function($rootScope, $q, $timeout, esHttp, $state, $sce, $sanitize, $translate,
                            esSettings, SocialUtils, CryptoUtils, UIUtils, csWallet, esWallet, csWot, BMA, Device, esProfile) {
  'ngInject';
  var
    defaultProfile,
    that = this,
    listeners;

  function onWalletReset(data) {
    data.profile = undefined;
    data.name = undefined;
    defaultProfile = undefined;
  }

  function onWalletLoginCheck(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey || !data.keypair) {
      deferred.resolve();
      return deferred.promise;
    }

    // Default user name
    if (data.name) {
      deferred.resolve(data);
      return deferred.promise;
    }

    var now = new Date().getTime();
    console.debug("[market] [wallet] Checking user profile...");

    // Check if profile exists
    esProfile.get(data.pubkey)
      .then(function(profile) {
        // Profile exists: use it !
        if (profile) {
          data.name = profile.name;
          data.avatar = profile.avatar;
          data.profile = profile.source;
          data.profile.description = profile.description;
          return;
        }

        // Invalid credentials (no user profile found)
        // AND no default profile to create a new one
        if (!defaultProfile) {
          UIUtils.alert.error('MARKET.ERROR.INVALID_LOGIN_CREDENTIALS');
          deferred.reject('RETRY');
          return deferred.promise;
        }
        // Fill default profile
        data.profile = data.profile || {};
        angular.merge(data.profile, defaultProfile);

        return esWallet.box.getKeypair()
          .then(function(keypair) {
            return $q.all([
              $translate('MARKET.PROFILE.DEFAULT_TITLE', {pubkey: data.pubkey}),
              // Encrypt socials
              SocialUtils.pack(angular.copy(data.profile.socials||[]), keypair)
            ])
          })
          .then(function(res) {
            var title = res[0];
            var encryptedSocials = res[1];

            data.name = data.profile.title || title;
            data.profile.title = data.name;
            data.profile.issuer = data.pubkey;

            // Add encrypted socials into a profile copy, then save it
            var copiedProfile = angular.copy(data.profile);
            copiedProfile.socials = encryptedSocials;
            return esProfile.add(copiedProfile);
          })
          .then(function() {
            // clean default profile
            defaultProfile = undefined;
          })
          .catch(function(err) {
            // clean default profile
            defaultProfile = undefined;

            console.error('[market] [user] Error while saving new profile', err);
            deferred.reject(err);
          });
      })
      .then(function() {
        console.info('[market] [wallet] Checked user profile in {0}ms'.format(new Date().getTime() - now));
        deferred.resolve(data);
      })
      .catch(function(err) {
        deferred.reject(err);
      });

    return deferred.promise;
  }

  function onWalletFinishLoad(data, deferred) {
    deferred = deferred || $q.defer();

    // TODO: Load record count
    //console.debug('[market] [user] Loading user record count...');
    // var now = new Date().getTime();
    deferred.resolve();

    return deferred.promise;
  }

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function addListeners() {
    // Extend csWallet and csWot events
    listeners = [
      csWallet.api.data.on.loginCheck($rootScope, onWalletLoginCheck, this),
      csWallet.api.data.on.finishLoad($rootScope, onWalletFinishLoad, this),
      csWallet.api.data.on.init($rootScope, onWalletReset, this),
      csWallet.api.data.on.reset($rootScope, onWalletReset, this)
    ];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [user] Disable");
      removeListeners();
      if (csWallet.isLogin()) {
        return onWalletReset(csWallet.data);
      }
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [user] Enable");
      addListeners();
      if (csWallet.isLogin()) {
        return onWalletLogin(csWallet.data);
      }
    }
  }

  // Default actions
  Device.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  that.setDefaultProfile = function(profile) {
    defaultProfile = angular.copy(profile);
  };

  return that;
})
;
