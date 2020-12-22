angular.module('cesium.market.settings.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('mkSettings');
    }

  })

.factory('mkSettings', function($rootScope, $q, $timeout, $ionicHistory, Api, csHttp, esHttp,
                            csConfig, csSettings, esSettings, csCurrency) {
  'ngInject';

  var
    SETTINGS_SAVE_SPEC = {
      includes: ['geoDistance', 'compactMode', 'maxAdAge'],
      excludes: ['enable', 'homeMessage', 'defaultTags', 'defaultAdminPubkeys', 'record', 'defaultSearch'],
      defaultSearch: {},
      cesiumApi: {}
    },
    defaultSettings = angular.merge({
        plugins: {
          market: {
            enable: true,
            compactMode: false,
            cesiumApi: {
              enable: true,
              baseUrl: "https://g1.duniter.fr/api"
            },
            maxAdAge: 60 * 60 * 24 * 365 // Max age of a Ad (in seconds) (=1 year)
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
  esSettings.setPluginSaveSpecs('market', SETTINGS_SAVE_SPEC);

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

  /**
   * Max age of a Ad (in seconds)
   * @returns {number|*}
   */
  that.getMaxAdAge = function() {
    return csSettings.data.plugins.market && csSettings.data.plugins.market.maxAdAge
      || defaultSettings.plugins.market.maxAdAge;
  }

  /**
   * Max age of a Ad (in seconds)
   * @returns {number|*}
   */
  that.getMinAdTime = function() {
    return (Date.now() / 1000) - that.getMaxAdAge();
  }

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
    data.plugins = data.plugins || {};

    // reset plugin settings, then restore defaults
    data.plugins.market = {};
    angular.merge(data, defaultSettings);

    deferred.resolve(data);
    return deferred.promise;
  }

  // Listen for settings changed
  function onSettingsChanged(data) {

    // Workaround (version < 1.2.6) : fix older settings
    var isVersionPrevious_1_2_6 = csHttp.version.compare(data.version, '1.2.6') <= 0;
    if (isVersionPrevious_1_2_6 && data.plugins && data.plugins.market) {
      console.info('[market] [settings] Detected version previous <= 1.2.6 - Fix older settings...');
      delete data.plugins.es.market;
      var geoDistance = data.plugins.market.geoDistance;
      delete data.plugins.market.geoDistance;
      data.plugins.market.defaultSearch = data.plugins.market.defaultSearch || {};
      data.plugins.market.defaultSearch.geoDistance = data.plugins.market.defaultSearch.geoDistance || geoDistance;
      data.plugins.market.maxAdAge = defaultSettings.plugins.market.maxAdAge;
    }

    data.plugins.es.document = data.plugins.es.document || {};
    data.plugins.es.document.index = 'user,page,group,market';
    data.plugins.es.document.type = 'profile,record,comment';

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
