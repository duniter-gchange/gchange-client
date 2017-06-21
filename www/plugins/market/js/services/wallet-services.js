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
    that = this,
    listeners;

  function onWalletReset(data) {
    data.profile = undefined;
    data.name = undefined;
  }

  function onWalletLogin(data, deferred) {
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

        // Profile not exists: make sure a default profile has been created (see login controller)
        if (!data.profile || !data.profile.socials) {
          console.error("[market] no default socials found. This is need for profile creation. Will logout !");
          $timeout(csWallet.logout, 500);
          deferred.resolve(data);
          return deferred.promise;
        }

        return esWallet.box.getKeypair()
          .then(function(keypair) {
            return $q.all([
              $translate('MARKET.PROFILE.DEFAULT_TITLE'),
              // Get a unique nonce
              SocialUtils.pack(angular.copy(data.profile.socials), keypair)
            ])
          })
          .then(function(res) {
            var title = res[0];
            var encryptedSocials = res[1];

            data.name = title;
            data.profile.title = title;
            data.profile.issuer = data.pubkey;

            var profileWithEncryptedSocials = angular.copy(data.profile);
            profileWithEncryptedSocials.socials = encryptedSocials;

            return esProfile.add(profileWithEncryptedSocials);
          })
          .catch(function(err) {
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
      csWallet.api.data.on.login($rootScope, onWalletLogin, this),
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

  return that;
})
;
