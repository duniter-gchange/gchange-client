
angular.module('cesium.settings.services', ['ngResource', 'ngApi', 'cesium.config'])

.factory('csSettings', function($rootScope, $q, Api, localStorage, $translate, csConfig) {
  'ngInject';

  // Define app locales
  var locales = [
    {id:'en',    label:'English', country: 'us'},
    {id:'en-GB', label:'English (UK)', country: 'gb'},
    {id:'eo-EO', label:'Esperanto'},
    {id:'fr-FR', label:'Français', country: 'fr'}
  ];
  var fallbackLocale = csConfig.fallbackLanguage ? fixLocale(csConfig.fallbackLanguage) : 'en';

  // Convert browser locale to app locale (fix #140)
  function fixLocale (locale) {
    if (!locale) return fallbackLocale;

    // exists in app locales: use it
    if (_.findWhere(locales, {id: locale})) return locale;

    // not exists: reiterate with the root(e.g. 'fr-XX' -> 'fr')
    var localeParts = locale.split('-');
    if (localeParts.length > 1) {
      return fixLocale(localeParts[0]);
    }

    // If another locale exists with the same root: use it
    var similarLocale = _.find(locales, function(l) {
      return String.prototype.startsWith.call(l.id, locale);
    });
    if (similarLocale) return similarLocale.id;

    return fallbackLocale;
  }

  // Convert browser locale to app locale (fix #140)
  function fixLocaleWithLog (locale) {
    var fixedLocale = fixLocale(locale);
    if (locale != fixedLocale) {
      console.debug('[settings] Fix locale [{0}] -> [{1}]'.format(locale, fixedLocale));
    }
    return fixedLocale;
  }

  var
  constants = {
    STORAGE_KEY: 'GCHANGE_SETTINGS'
  },
  // Settings that user cannot change himself (only config can override this values)
  fixedSettings = {
    timeWarningExpireMembership: 2592000 * 2 /*=2 mois*/,
    timeWarningExpire: 2592000 * 3 /*=3 mois*/,
    timeout : 4000,
    cacheTimeMs: 60000, /*1 min*/
    latestReleaseUrl: "https://api.github.com/repos/duniter-gchange/gchange-client/releases/latest",
    newIssueUrl: "https://github.com/duniter-gchange/gchange-client/issues/new?labels=bug",
    userForumUrl: "https://forum.gchange.fr",
    minVersion: '1.2.0', // min duniter version
    httpsMode: false
  },
  defaultSettings = angular.extend(
    {
    useRelative: false,
    useLocalStorage: true, // override to false if no device
    walletHistoryTimeSecond: 30 * 24 * 60 * 60 /*30 days*/,
    walletHistorySliceSecond: 5 * 24 * 60 * 60 /*download using 5 days slice*/,
    rememberMe: true, // override to false if no device
    showLoginSalt: false,
    expertMode: false,
    decimalCount: 2,
    uiEffects: true,
    blockValidityWindow: 6,
    helptip: {
      enable: false,
      installDocUrl: "https://github.com/duniter-gchange/gchange-client/blob/master/README.md",
      currency: 0,
      wot: 0,
      wotCerts: 0,
      wallet: 0,
      walletCerts: 0,
      header: 0,
      settings: 0
    },
    wallet: {
      showPubkey: true,
      alertIfUnusedWallet: true,
      notificationReadTime: 0
    },
    locale: {
      id: fixLocaleWithLog(csConfig.defaultLanguage || $translate.use()) // use config locale if set, or browser default
    }
  },
    fixedSettings,
    csConfig),

  data = {},
  previousData,
  started = false,
  startPromise,
  api = new Api(this, "csSettings");

  var
  reset = function() {
    _.keys(data).forEach(function(key){
      delete data[key];
    });

    applyData(defaultSettings);

    return api.data.raisePromise.reset(data)
      .then(store);
  },

  getByPath = function(path, defaultValue) {
    var obj = data;
    _.each(path.split('.'), function(key) {
      obj = obj[key];
      if (angular.isUndefined(obj)) {
        obj = defaultValue;
        return; // stop
      }
    });

    return obj;
  },

  emitChangedEvent = function() {
    var hasChanged = previousData && !angular.equals(previousData, data);
    previousData = angular.copy(data);
    if (hasChanged) {
      api.data.raise.changed(data);
    }
  },

  store = function() {
    if (!started) {
      console.debug('[setting] Waiting start finished...');
      return startPromise.then(store);
    }

    var promise;
    if (data.useLocalStorage) {
      promise = localStorage.setObject(constants.STORAGE_KEY, data);
    }
    else {
      promise  = localStorage.setObject(constants.STORAGE_KEY, null);
    }

    return promise
      .then(function() {
        if (data.useLocalStorage) {
          console.debug('[setting] Saved');
        }

        // Emit event on store
        return api.data.raisePromise.store(data);
      })

      // Emit event on store
      .then(emitChangedEvent);
  },

  applyData = function(newData) {
    var localeChanged = false;
    if (newData.locale && newData.locale.id) {
      // Fix previously stored locale (could use bad format)
      newData.locale.id = fixLocale(newData.locale.id);
      localeChanged = !data.locale || newData.locale.id !== data.locale.id || newData.locale.id !== $translate.use();
    }

    // Apply stored settings
    angular.merge(data, newData);

    // Force some fixed settings
    _.keys(fixedSettings).forEach(function(key) {
      data[key] = defaultSettings[key]; // This will apply fixed value (override by config.js file)
    });

    // Replace OLD default duniter node, by gchange node
    if ((data.plugins && data.plugins.es.host && data.plugins.es.port) &&
        (!data.node || (data.node.host !== data.plugins.es.host))) {
      var oldBmaNode = data.node.host;
      var newBmaNode = data.plugins.es.host;
      console.warn("[settings] Replacing duniter node {{0}} with gchange pod {{1}}".format(oldBmaNode, newBmaNode));
      data.node = {
        host: newBmaNode,
        port: data.plugins.es.port,
        useSsl: data.plugins.es.useSsl
      };
    }

    // Apply the new locale (only if need)
    if (localeChanged) {
      $translate.use(fixLocale(data.locale.id)); // will produce an event cached by onLocaleChange();
    }

  },

  restore = function() {
    var now = new Date().getTime();
    return localStorage.getObject(constants.STORAGE_KEY)
        .then(function(storedData) {
          // No settings stored
          if (!storedData) {
            console.debug("[settings] No settings in local storage. Using defaults.");
            applyData(defaultSettings);
            emitChangedEvent();
            return;
          }

          // Apply stored data
          applyData(storedData);

          console.debug('[settings] Loaded from local storage in '+(new Date().getTime()-now)+'ms');
          emitChangedEvent();
        });
  },

    // Detect locale sucessuf changes, then apply to vendor libs
  onLocaleChange = function() {
    var locale = $translate.use();
    console.debug('[settings] Locale ['+locale+']');

    // config moment lib
    try {
      moment.locale(locale.substr(0,2));
    }
    catch(err) {
      moment.locale('en');
      console.warn('[settings] Unknown local for moment lib. Using default [en]');
    }

    // config numeral lib
    try {
      numeral.language(locale.substr(0,2));
    }
    catch(err) {
      numeral.language('en');
      console.warn('[settings] Unknown local for numeral lib. Using default [en]');
    }

    // Emit event
    api.locale.raise.changed(locale);
  },


  ready = function() {
    if (started) return $q.when();
    return startPromise || start();
  },

  start = function() {
    console.debug('[settings] Starting...');

    startPromise = localStorage.ready()

      // Restore
      .then(restore)

      // Emit ready event
      .then(function() {
        console.debug('[settings] Started');
        started = true;
        startPromise = null;
        // Emit event (used by plugins)
        api.data.raise.ready(data);
      });

    return startPromise;
  };

  $rootScope.$on('$translateChangeSuccess', onLocaleChange);

  api.registerEvent('data', 'reset');
  api.registerEvent('data', 'changed');
  api.registerEvent('data', 'store');
  api.registerEvent('data', 'ready');
  api.registerEvent('locale', 'changed');

  // Apply default settings. This is required on some browser (web or mobile - see #361)
  applyData(defaultSettings);

  // Default action
  start();

  return {
    ready: ready,
    data: data,
    getByPath: getByPath,
    reset: reset,
    store: store,
    restore: restore,
    defaultSettings: defaultSettings,
    // api extension
    api: api,
    locales: locales
  };
});
