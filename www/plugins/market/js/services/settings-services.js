angular.module('cesium.market.settings.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('mkSettings');
    }

  })

.factory('mkSettings', function($rootScope, $q, $timeout, $ionicHistory, Api, esHttp,
                            csConfig, csSettings, esSettings, csCurrency, csWallet) {
  'ngInject';

  var
    defaultSettings = angular.merge({
        plugins: {
          market: {
            enable: true
          }
        }
    }, {plugins: {market: csConfig.plugins && csConfig.plugins.market || {}}}),
    that = this,
    readyDeferred = $q.defer(),
    listeners,
    ignoreSettingsChanged = false
  ;

  that.raw = {
    currencies: undefined
  };

  that.isEnable = function(data) {
    data = data || csSettings.data;
    return data.plugins && data.plugins.es && data.plugins.es.enable &&
           data.plugins.market && data.plugins.market.enable;
  };

  that.currencies = function() {
    if (readyDeferred) {
      return readyDeferred.promise.then(function() {
        return that.raw.currencies;
      });
    }
    return $q.when(that.raw.currencies);
  };

  function _initCurrencies(data, deferred) {
    deferred = deferred || $q.defer();
    if (that.enable) {
      that.raw.currencies = data.plugins.market.currencies;
      if (!that.raw.currencies && data.plugins.market.defaultCurrency) {
        that.raw.currencies = [data.plugins.market.defaultCurrency];
        console.debug('[market] [settings] Currencies: ', that.raw.currencies);
        if (deferred) deferred.resolve(that.raw.currencies);
      }
      else {
        return csCurrency.get()
            .then(function(currency) {
              that.raw.currencies = [currency.name];
              console.debug('[market] [settings] Currencies: ', that.raw.currencies);
              if (deferred) deferred.resolve(that.raw.currencies);
            })
            .catch(function(err) {
              if (deferred) {
                deferred.reject(err);
              }
              else {
                throw err;
              }
            });
      }

    }
    else {
      that.raw.currencies = [];
      if (deferred) deferred.resolve(that.raw.currencies);
    }
    return deferred.promise;
  }

  function onSettingsReset(data, deferred) {
    deferred = deferred || $q.defer();
    angular.merge(data, defaultSettings);
    deferred.resolve(data);
    return deferred.promise;
  }

  // Listen for settings changed
  function onSettingsChanged(data) {

    // Init currencies
    _initCurrencies(data);
  }

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function addListeners() {
    // Listening some events
    listeners = [
      csSettings.api.data.on.reset($rootScope, onSettingsReset, this),
      csSettings.api.data.on.changed($rootScope, onSettingsChanged, this)
    ];
  }

  that.ready = function() {
    if (!readyDeferred) return $q.when();
    return readyDeferred.promise;
  };

  esSettings.api.state.on.changed($rootScope, function(enable) {
    enable = enable && that.isEnable();
    if (enable === that.enable) return; // nothing changed

    that.enable = enable;
    if (enable) {
      console.debug('[market] [settings] Enable');
      addListeners();
    }
    else {
      console.debug('[market] [settings] Disable');
      removeListeners();
    }
    // Init currencies
    onSettingsChanged(csSettings.data);
    if (readyDeferred) {
      readyDeferred.resolve();
      readyDeferred = null;
    }
  });

  return that;
});
