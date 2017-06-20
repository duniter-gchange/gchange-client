angular.module('cesium.market.user.services', ['cesium.es.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.market;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('mkUser');
    }

  })

.factory('mkUser', function($rootScope, $q, $timeout, esHttp, $state, $sce, $sanitize,
                            esSettings, CryptoUtils, UIUtils, csWallet, csWot, BMA, Device, esUser) {
  'ngInject';
  var
    that = this,
    listeners;

  that.raw = {
  };

  function onWalletReset(data) {
    //data.email = null;
  }

  function onWalletLogin(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey) {
      deferred.resolve();
      return deferred.promise;
    }

    // Default user name
    if (!data.name) {

      esUser.profile.get({id: data.pubkey})
        .catch(function(err) {
          // User not found: continue
          if (err && err.ucode == 404) {
            return;
          }
          else {
            console.error(err);
            deferred.reject(data);
          }
        })
        .then(function(res) {
          if (!res || !res.found) {
            console.debug("[market] new user detected: saving default profile");
            data.name = 'Nouvel utilisateur';
            data.profile = {
              title: data.name,
              issuer: data.pubkey
            };
            return esUser.profile.add(data.profile)
          }
          else {
            data.profile = res._source;
            data.name = data.profile.title;
          }
        })
        .then(function() {
          deferred.resolve(data);
        })
        .catch(function(err) {
          console.error(err);
          deferred.resolve(data);
        });
    }
    else {
      deferred.resolve(data);
    }

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
