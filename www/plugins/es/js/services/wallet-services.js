angular.module('cesium.es.wallet.services', ['ngResource', 'cesium.platform', 'cesium.es.http.services', 'cesium.es.crypto.services'])

.factory('esWallet', function($q, $rootScope, $timeout, CryptoUtils, csPlatform, csWallet, esCrypto, esProfile, esHttp) {
  'ngInject';

  var
    listeners,
    that = this;

  that.isModerator = function() {
    return csWallet.data.moderator || false;
  };

  function onWalletReset(data) {
    data.avatar = null;
    data.profile = null;
    data.name = null;
    data.moderator = false;
    csWallet.events.cleanByContext('esWallet');
    if (data.keypair) {
      delete data.keypair.boxSk;
      delete data.keypair.boxPk;
    }
  }

  function onWalletLogin(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey || !data.keypair) {
      deferred.resolve();
      return deferred.promise;
    }

    // Waiting to load crypto libs
    if (!CryptoUtils.isLoaded()) {
      console.debug('[ES] [wallet] Waiting crypto lib loading...');
      return $timeout(function() {
        return onWalletLogin(data, deferred);
      }, 50);
    }

    // Set if moderator
    data.moderator = esHttp.data.moderators.includes(data.pubkey);
    console.debug('[ES] [wallet] Moderator: ' + data.moderator);

    console.debug('[ES] [wallet] Loading user avatar+name...');
    var now = Date.now();

    esProfile.getAvatarAndName(data.pubkey)
      .then(function(profile) {
        if (profile) {
          data.name = profile.name;
          data.avatarStyle = profile.avatarStyle;
          data.avatar = profile.avatar;
          console.debug('[ES] [wallet] Loaded user avatar+name in '+ (Date.now()-now) +'ms');
        }
        else {
          console.debug('[ES] [wallet] No user avatar+name found');
        }
        deferred.resolve(data);
      })
      .catch(function(err){
        deferred.reject(err);
      });

    return deferred.promise;
  }

  function onWalletFinishLoad(data, deferred) {
    deferred = deferred || $q.defer();

    // Reset events
    csWallet.events.cleanByContext('esWallet');

    // If membership pending, but not enough certifications: suggest to fill user profile
    //if (!data.name && data.requirements.pendingMembership && data.requirements.needCertificationCount > 0) {
    //  csWallet.events.add({type:'info', message: 'ACCOUNT.EVENT.MEMBER_WITHOUT_PROFILE', context: 'esWallet'});
    //}

    console.debug('[ES] [wallet] Loading full user profile...');
    var now = Date.now();

    // Load full profile
    esProfile.get(data.pubkey)
      .then(function(profile) {
        if (profile) {
          data.name = profile.name;
          data.avatar = profile.avatar;
          data.profile = profile.source;

          // Override HTML description
          data.profile.description = profile.description;

          console.debug('[ES] [wallet] Loaded full user profile in '+ (Date.now()-now) +'ms');
        }
        deferred.resolve();
      })
      .catch(deferred.reject);

    return deferred.promise;
  }

  function getBoxKeypair() {
    if (!csWallet.isLogin()) {
      throw new Error('Unable to get box keypair: user not connected !');
    }
    var keypair = csWallet.data.keypair;
    // box keypair already computed: use it
    if (keypair && keypair.boxPk && keypair.boxSk) {
      return $q.when(keypair);
    }

    // Compute box keypair
    return esCrypto.box.getKeypair(keypair)
      .then(function(res) {
        csWallet.data.keypair.boxSk = res.boxSk;
        csWallet.data.keypair.boxPk = res.boxPk;
        console.debug("[ES] [wallet] Secret box keypair successfully computed");
        return csWallet.data.keypair;
      });
  }

  function addListeners() {
    // Extend csWallet events
    listeners = [
      csWallet.api.data.on.login($rootScope, onWalletLogin, this),
      csWallet.api.data.on.finishLoad($rootScope, onWalletFinishLoad, this),
      csWallet.api.data.on.init($rootScope, onWalletReset, this),
      csWallet.api.data.on.reset($rootScope, onWalletReset, this)
    ];
  }

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [wallet] Disable");
      removeListeners();
      if (csWallet.isLogin()) {
        return onWalletReset(csWallet.data);
      }
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [wallet] Enable");
      addListeners();
      if (csWallet.isLogin()) {
        return onWalletLogin(csWallet.data);
      }
    }
  }

  // Default action
  csPlatform.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  // exports
  that.box = {
    getKeypair: getBoxKeypair,
    record: {
      pack: function(record, keypair, recipientFieldName, cypherFieldNames, nonce) {
        return getBoxKeypair()
          .then(function(fullKeypair) {
            return esCrypto.box.pack(record, fullKeypair, recipientFieldName, cypherFieldNames, nonce);
          });
      },
      open: function(records, keypair, issuerFieldName, cypherFieldNames) {
        return getBoxKeypair()
          .then(function(fullKeypair) {
            return esCrypto.box.open(records, fullKeypair, issuerFieldName, cypherFieldNames);
          });
      }
    }
  };


  return that;
})
;
