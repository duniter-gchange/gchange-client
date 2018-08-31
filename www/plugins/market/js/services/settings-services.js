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
                            csConfig, csSettings, esSettings, csCurrency) {
  'ngInject';

  var
    defaultSettings = angular.merge({
        plugins: {
          market: {
            enable: true,
            geoDistance: "20km"
          },
          converse: {
            jid : "anonymous.duniter.org",
            bosh_service_url: "https://chat.duniter.org/http-bind/",
            auto_join_rooms : [
              "gchange@muc.duniter.org"
            ]
          }
        }
      },
      // Market plugin
      {plugins: {market: csConfig.plugins && csConfig.plugins.market || {}}},
      // Converse plugin
      {plugins: {converse: csConfig.plugins && csConfig.plugins.converse || {}}}
    ),
    that = this,
    readyDeferred = $q.defer(),
    listeners,
    ignoreSettingsChanged = false
  ;

  // Define settings to save remotely
  esSettings.setPluginSaveSpecs('market', {
    includes: [], // during active devlpment, ddo not store any market settings
    excludes: ['enable', 'homeMessage', 'defaultTags', 'defaultAdminPubkeys', 'record']
  });

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

  function _compareVersion(version1, version2) {

    var parts = version1 && version1.split('.');
    var version1 = parts && parts.length == 3 ? {
      major: parseInt(parts[0]),
      minor: parseInt(parts[1]),
      build: parseInt(parts[2])
    }: {};
    parts = version2 && version2.split('.');
    var version2 = parts && parts.length == 3 ? {
      major: parseInt(parts[0]),
      minor: parseInt(parts[1]),
      build: parseInt(parts[2])
    } : {};

    // check major
    if (version1.major != version2.major) {
      return version1.major < version2.major ? -1 : 1;
    }
    // check minor
    if (version1.minor != version2.minor) {
      return version1.minor < version2.minor ? -1 : 1;
    }
    // check build
    if (version1.build != version2.build) {
      return version1.build < version2.build ? -1 : 1;
    }
    return 0; // equals
  }

  function onSettingsReset(data, deferred) {
    deferred = deferred || $q.defer();
    data.plugins = data.plugins || {};

    // reset plugin settings, then restore defaults
    data.plugins.market = {};
    angular.merge(data, defaultSettings);

    deferred.resolve(data);
    return deferred.promise;
  }

  // Listen for settings changed
  function onSettingsChanged(data) {

    // Workaround (version < 0.5.0) : remove older settings
    var isVersionPrevious_0_5_0 = _compareVersion(data.version, '0.5.0') <= 0;
    if (isVersionPrevious_0_5_0 && data.plugins && data.plugins.market) {
      console.info('[market] [settings] Detected version previous <= 0.5.0 - restoring default settings...');
      delete data.login;
      data.plugins.market = angular.copy(defaultSettings.plugins.market);
    }

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
