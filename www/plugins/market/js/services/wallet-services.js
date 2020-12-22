angular.module('cesium.market.wallet.services', ['cesium.es.services'])
.config(function(PluginServiceProvider) {
    'ngInject';

    // Will force to load this service
    PluginServiceProvider.registerEagerLoadingService('mkWallet');

  })

.factory('mkWallet', function($rootScope, $q, $timeout, esHttp, $state, $sce, $sanitize, $translate,
                              UIUtils, csSettings, csWallet, csWot, BMA, Device, csPlatform,
                              SocialUtils, CryptoUtils,  esWallet, esProfile, esSubscription, mkRecord) {
  'ngInject';
  var
    defaultProfile,
    defaultSubscription,
    that = this,
    listeners;

  function onWalletReset(data) {
    data.profile = undefined;
    data.name = undefined;
    data.favorites = data.favorites || {};
    data.favorites.count = null;
    defaultProfile = undefined;
    defaultSubscription = undefined;
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

    var now = Date.now();
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
          return; // Continue
        }

        // Invalid credentials (no user profile found)
        // AND no default profile to create a new one
        if (!defaultProfile) {
          UIUtils.alert.error('MARKET.ERROR.INVALID_LOGIN_CREDENTIALS');
          deferred.reject('RETRY');
          return deferred.promise;
        }

        // Save the new user profile
        return registerNewProfile(data);
      })

      .then(function() {
        return registerNewSubscription(data);
      })
      .then(function() {
        console.info('[market] [wallet] Checked user profile in {0}ms'.format(Date.now() - now));
        deferred.resolve(data);
      })
      .catch(deferred.reject);

    return deferred.promise;
  }

  function registerNewProfile(data) {
    if (!defaultProfile) return;

    var now = Date.now();
    console.debug("[market] [wallet] Saving user profile...");

    // Profile not exists, but it exists a default profile (from the join controller)
    data.profile = data.profile || {};

    angular.merge(data.profile, defaultProfile);

    return esWallet.box.getKeypair()
      .then(function(keypair) {
        return $q.all([
          $translate('MARKET.PROFILE.DEFAULT_TITLE', {pubkey: data.pubkey}),
          // Encrypt socials
          SocialUtils.pack(angular.copy(data.profile.socials||[]), keypair)
        ]);
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

        // Save the profile
        return esProfile.add(copiedProfile);
      })
      .then(function() {
        // clean default profile
        defaultProfile = undefined;
        console.info('[market] [wallet] Saving user profile in {0}ms'.format(Date.now() - now));
      })
      .catch(function(err) {
        // clean default profile
        defaultProfile = undefined;
        console.error('[market] [wallet] Error while saving new profile', err);
        throw err;
      });
  }

  function registerNewSubscription(data) {
    if (!defaultSubscription) return;

    // Find the ES node pubkey (from its peer document)
    return esHttp.network.peering.self()
        .then(function(res) {
          if (!res || !res.pubkey) return; // no pubkey: exit

          var record = angular.merge({
            type: 'email',
            recipient: res.pubkey,
            content: {
              locale: csSettings.data.locale.id,
              frequency: 'daily'
            }
          }, defaultSubscription);

          if (record.type === 'email' && !record.content.email) {
            console.warn("Missing email attribute (subscription content). Cannot subscribe!");
            return;
          }

          return esSubscription.record.add(record, csWallet);
        })
        .then(function() {
          data.subscriptions = data.subscriptions || {count: 0};
          data.subscriptions.count++;
          defaultSubscription = undefined;
        })
        .catch(function(err) {
          defaultSubscription = undefined;
          console.error('[market] [wallet] Error while saving new subscription', err);
          throw err;
        });
  }

  function onWalletFinishLoad(data, deferred) {
    deferred = deferred || $q.defer();

    var now = Date.now();
    console.debug('[market] [user] Loading favorites...');

    mkRecord.record.like.load({
      issuer: data.pubkey,
      kinds: ['LIKE', 'FOLLOW'],
      size: 0
    })
      .then(function(res) {
        data.favorites = data.favorites || {};
        data.favorites.count = res && res.total || 0;
      })
      .then(function() {
        console.info('[market] [wallet] Loaded favorites ({0}) in {1}ms'.format(data.favorites.count, Date.now() - now));
        deferred.resolve(data);
      })
      .catch(deferred.reject);

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
      console.debug("[market] [user] Disable");
      removeListeners();
      if (csWallet.isLogin()) {
        return onWalletReset(csWallet.data);
      }
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[market] [user] Enable");
      addListeners();
      if (csWallet.isLogin()) {
        onWalletReset(csWallet.data);
        return onWalletLoginCheck(csWallet.data)
          .then(onWalletFinishLoad);
      }
    }
  }

  // Default actions
  csPlatform.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  that.setDefaultProfile = function(profile) {
    defaultProfile = angular.copy(profile);
  };

  that.setDefaultSubscription = function(subscription) {
    defaultSubscription = angular.copy(subscription);
  };

  return that;
})
;
