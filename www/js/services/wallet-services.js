
angular.module('cesium.wallet.services', ['ngApi', 'ngFileSaver', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services',
  'cesium.settings.services'])


.factory('csWallet', function($q, $rootScope, $timeout, $translate, $filter, Api, localStorage,
                              CryptoUtils, BMA, csConfig, csSettings, FileSaver, Blob, csWot, csTx, csCurrency) {
  'ngInject';

  function factory(id, BMA) {

    var
    constants = {
      OLD_STORAGE_KEY: 'CESIUM_DATA',
      STORAGE_KEY: 'GCHANGE_DATA'
    },
    data = {},
    listeners,
    started,
    startPromise,
    api = new Api(this, 'csWallet-' + id),

    resetData = function(init) {
      data.loaded = false;
      data.pubkey = null;
      data.qrcode = null;

      data.uid = null;
      data.isNew = null;
      data.events = [];

      resetKeypair();

      started = false;
      startPromise = undefined;

      if (init) {
        api.data.raise.init(data);
      }
      else {
        if (!csSettings.data.useLocalStorage) {
          csSettings.reset();
        }
        api.data.raise.reset(data);
      }
    },

    resetKeypair = function(){
      data.keypair = {
        signSk: null,
        signPk: null
      };
    },

    login = function(salt, password) {
      if (!salt || !password) throw Error('Missing required arguments');
      return CryptoUtils.scryptKeypair(salt, password)
        .then(function(keypair) {
          // Copy result to properties
          data.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);

          // FOR DEV ONLY - on crosschain
          // console.error('TODO REMOVE this code - dev only'); data.pubkey = '36j6pCNzKDPo92m7UXJLFpgDbcLFAZBgThD2TCwTwGrd';

          data.keypair = keypair;

          // Call login check (can stop the login process)
          return api.data.raisePromise.loginCheck(data)
            // reset data then stop process
            .catch(function(err) {
              resetData();
              throw err;
            })
            // Call extend api (cannot stop login process)
            .then(function() {
              return api.data.raisePromise.login(data);
            });
        })

        // store if need
        .then(function() {
          if (csSettings.data.useLocalStorage) {
            store();
          }
          return data;
        });
    },

    logout = function() {
      return $q(function(resolve, reject) {

        resetData(); // will reset keypair
        store(); // store (if local storage enable)

        // Send logout event
        api.data.raise.logout();

        // Send unauth event (compat with new Cesium auth)
        api.data.raise.unauth();

        resolve();
      });
    },

    isLogin = function() {
      return !!data.pubkey;
    },

    getKeypair = function(options) {
      if (!started) {
        return (startPromise || start())
          .then(function () {
            return getKeypair(options); // loop
          });
      }

      if (isLogin()) {
        return $q.when(data.keypair);
      }
      return $q.reject('Not auth');
    },

    isDataLoaded = function(options) {
      if (options && options.minData) return data.loaded;
      return data.loaded; // && data.sources; -- Gchange not use sources
    },

    isNeverUsed = function() {
      if (!data.loaded) return undefined; // undefined if not full loaded
      return !data.pubkey || !(
         // Check extended data (name, profile, avatar)
         data.name ||
         data.profile ||
         data.avatar
        );
    },

    isNew = function() {return !!data.isNew;},

    // If connected and same pubkey
    isUserPubkey = function(pubkey) {
      return isLogin() && data.pubkey === pubkey;
    },

    store = function() {
      if (csSettings.data.useLocalStorage) {

        if (isLogin() && csSettings.data.rememberMe) {

          var dataToStore = {
            keypair: data.keypair,
            pubkey: data.pubkey,
            version: csConfig.version
          };

          localStorage.setObject(constants.STORAGE_KEY, dataToStore);
        }
        else {
          localStorage.setObject(constants.STORAGE_KEY, null);
        }
      }
      else {
        localStorage.setObject(constants.STORAGE_KEY, null);
      }

      // Remove old storage key
      localStorage.setObject(constants.OLD_STORAGE_KEY, null);
    },

    restore = function() {
      return localStorage.get(constants.STORAGE_KEY)
          .then(function(dataStr) {
            // If found: continue
            if (dataStr) return dataStr;

            // If not found, then read the old storage key
            try {
              return localStorage.get(constants.OLD_STORAGE_KEY)
                .catch(function() {
                  console.debug('No settings stored in ' + constants.OLD_STORAGE_KEY + ' key. Continue');
                  return; // Continue if not found
                });
            }
            catch(err) {
              console.debug('No settings stored in ' + constants.OLD_STORAGE_KEY + ' key. Continue');
              return; // Continue if error
            }
          })
        .then(function(dataStr) {
          if (!dataStr) return;
          return fromJson(dataStr, false)
            .then(function(storedData){
              if (storedData && storedData.keypair && storedData.pubkey) {
                data.keypair = storedData.keypair;
                data.pubkey = storedData.pubkey;
                data.loaded = false;

                // Call extend api
                return api.data.raisePromise.login(data);
              }
            })
            .then(function(){
              return data;
            });
        });
    },

    getData = function() {
      return data;
    },

    loadQrCode = function(){
      if (!data.pubkey || data.qrcode) return $q.when(data.qrcode);
      console.debug("[wallet] Creating SVG QRCode...");
      return $timeout(function() {
        data.qrcode = UIUtils.qrcode.svg(data.pubkey);
        return data.qrcode;
      });
    },

    loadData = function(options) {

      if (options && options.minData) {
        return loadMinData(options);
      }

      if (options || data.loaded) {
        return refreshData(options);
      }

      return loadFullData();
    },

    loadFullData = function() {
      data.loaded = false;

      return $q.all([

          // API extension
          api.data.raisePromise.load(data, null)
            .catch(function(err) {
              console.error('Error while loading wallet data, on extension point. Try to continue');
              console.error(err);
            })
        ])
        .then(function() {
          return api.data.raisePromise.finishLoad(data)
            .catch(function(err) {
              console.error('Error while finishing wallet data load, on extension point. Try to continue');
              console.error(err);
            });
        })
        .then(function() {
          data.loaded = true;
          return data;
        })
        .catch(function(err) {
          data.loaded = false;
          throw err;
        });
    },

    loadMinData = function(options) {
      options = options || {};
      return refreshData(options);
    },

    refreshData = function(options) {
        options = options || {
          api: true
        };

      // Force some load (parameters & requirements) if not already loaded
      var jobs = [];

      // Reset events
      cleanEventsByContext('requirements');

      // API extension (force if no other jobs)
      if (!jobs.length || options.api) jobs.push(api.data.raisePromise.load(data, options));

      return $q.all(jobs)
      .then(function(){
        return api.data.raisePromise.finishLoad(data);
      })
      .then(function(){
        return data;
      })
      .catch(function(err) {
        console.error("Failed to execute refreshData() jobs:", err);
      });
    },

    addEvent = function(event, insertAtFirst) {
      event = event || {};
      event.type = event.type || 'info';
      event.message = event.message || '';
      event.messageParams = event.messageParams || {};
      event.context = event.context || 'undefined';
      if (event.message.trim().length) {
        if (!insertAtFirst) {
          data.events.push(event);
        }
        else {
          data.events.splice(0, 0, event);
        }
      }
      else {
        console.debug('Event without message. Skipping this event');
      }
    },

    getkeypairSaveId = function(record) {
        var nbCharSalt = Math.round(record.answer.length / 2);
        var salt = record.answer.substr(0, nbCharSalt);
        var pwd = record.answer.substr(nbCharSalt);
        return CryptoUtils.scryptKeypair(salt, pwd)
          .then(function (keypair) {
            record.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
            record.keypair = keypair;
            return record;
          });
      },

    getCryptedId = function(record){
      return getkeypairSaveId(record)
        .then(function() {
          return CryptoUtils.util.random_nonce();
        })
        .then(function(nonce) {
          record.nonce = nonce;
          return CryptoUtils.box.pack(record.salt, record.nonce, record.keypair.boxPk, record.keypair.boxSk);
        })
        .then(function (cypherSalt) {
          record.salt = cypherSalt;
          return CryptoUtils.box.pack(record.pwd, record.nonce, record.keypair.boxPk, record.keypair.boxSk);
        })
        .then(function (cypherPwd) {
          record.pwd = cypherPwd;
          record.nonce = CryptoUtils.util.encode_base58(record.nonce);
          return record;
        });
    },

    recoverId = function(recover) {
      var nonce = CryptoUtils.util.decode_base58(recover.cypherNonce);
      return getkeypairSaveId(recover)
        .then(function (recover) {
          return CryptoUtils.box.open(recover.cypherSalt, nonce, recover.keypair.boxPk, recover.keypair.boxSk);
        })
        .then(function (salt) {
          recover.salt = salt;
          return CryptoUtils.box.open(recover.cypherPwd, nonce, recover.keypair.boxPk, recover.keypair.boxSk);
        })
        .then(function (pwd) {
          recover.pwd = pwd;
          return recover;
        })
        .catch(function(err){
          console.warn('Incorrect answers - Unable to recover passwords');
        });
    },

    getSaveIDDocument = function(record) {
      var saveId = 'Version: 10 \n' +
        'Type: SaveID\n' +
        'Questions: ' + '\n' + record.questions +
        'Issuer: ' + data.pubkey + '\n' +
        'Crypted-Nonce: '+ record.nonce + '\n'+
        'Crypted-Pubkey: '+ record.pubkey +'\n' +
        'Crypted-Salt: '+ record.salt  + '\n' +
        'Crypted-Pwd: '+ record.pwd + '\n';

      // Sign SaveId document
      return CryptoUtils.sign(saveId, data.keypair)

        .then(function(signature) {
          saveId += signature + '\n';
          console.debug('Has generate an SaveID document:\n----\n' + saveId + '----');
          return saveId;
        });

    },

    downloadSaveId = function(record){
      return getSaveIDDocument(record)
        .then(function(saveId) {
          var saveIdFile = new Blob([saveId], {type: 'text/plain; charset=utf-8'});
          FileSaver.saveAs(saveIdFile, 'saveID.txt');
        });

    },

    cleanEventsByContext = function(context){
      data.events = data.events.reduce(function(res, event) {
        if (event.context && event.context == context) return res;
        return res.concat(event);
      },[]);
    },

    /**
    * De-serialize from JSON string
    */
    fromJson = function(json, failIfInvalid) {
      failIfInvalid = angular.isUndefined(failIfInvalid) ? true : failIfInvalid;
      return $q(function(resolve, reject) {
        var obj = JSON.parse(json || '{}');
        // FIXME #379
        /*if (obj && obj.pubkey) {
          resolve({
            pubkey: obj.pubkey
          });
        }
        else */
        if (obj && obj.keypair && obj.keypair.signPk && obj.keypair.signSk) {
          var keypair = {};
          var i;

          // sign Pk : Convert to Uint8Array type
          var signPk = new Uint8Array(32);
          for (i = 0; i < 32; i++) signPk[i] = obj.keypair.signPk[i];
          keypair.signPk = signPk;

          var signSk = new Uint8Array(64);
          for (i = 0; i < 64; i++) signSk[i] = obj.keypair.signSk[i];
          keypair.signSk = signSk;

          // box Pk : Convert to Uint8Array type
          if (obj.version && obj.keypair.boxPk) {
            var boxPk = new Uint8Array(32);
            for (i = 0; i < 32; i++) boxPk[i] = obj.keypair.boxPk[i];
            keypair.boxPk = boxPk;
          }

          if (obj.version && obj.keypair.boxSk) {
            var boxSk = new Uint8Array(32);
            for (i = 0; i < 64; i++) boxSk[i] = obj.keypair.boxSk[i];
            keypair.boxSk = boxSk;
          }

          resolve({
            pubkey: obj.pubkey,
            keypair: keypair,
            tx: obj.tx
          });
        }
        else if (failIfInvalid) {
          reject('Not a valid Wallet.data object');
        }
        else {
          resolve();
        }
      });
    }
    ;

    function addListeners() {
      listeners = [
        // Listen if settings changed
        csSettings.api.data.on.changed($rootScope, store, this),
        // Listen if node changed
        BMA.api.node.on.restart($rootScope, restart, this)
      ];
    }

    function removeListeners() {
      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function ready() {
      if (started) return $q.when();
      return startPromise || start();
    }

    function stop() {
      console.debug('[wallet] Stopping...');
      removeListeners();
      resetData();
    }

    function restart() {
      stop();
      return $timeout(start, 200);
    }

    function start() {
      console.debug('[wallet] Starting...');
      var now = new Date().getTime();

      startPromise = $q.all([
          csSettings.ready(),
          csCurrency.ready(),
          BMA.ready()
        ])

        // Restore
        .then(restore)

        // Load data (if a wallet restored)
        .then(function(data) {
          if (data && data.pubkey) {
            return loadData({minData: true});
          }
        })

        // Emit ready event
        .then(function() {
          addListeners();

          console.debug('[wallet] Started in ' + (new Date().getTime() - now) + 'ms');

          started = true;
          startPromise = null;

          // Emit event (used by plugins)
          api.data.raise.ready(data);
        })
        .then(function(){
          return data;
        });

      return startPromise;
    }

    // Register extension points
    api.registerEvent('data', 'ready');
    api.registerEvent('data', 'init');
    api.registerEvent('data', 'loginCheck'); // allow to stop the login process
    api.registerEvent('data', 'login'); // executed after login check (cannot stop the login process)
    api.registerEvent('data', 'load');
    api.registerEvent('data', 'finishLoad');
    api.registerEvent('data', 'logout');
    api.registerEvent('data', 'unauth');
    api.registerEvent('data', 'reset');

    api.registerEvent('error', 'send');

    api.registerEvent('action', 'certify');

    // init data
    resetData(true);

    return {
      id: id,
      data: data,
      ready: ready,
      start: start,
      stop: stop,
      // auth
      login: login,
      logout: logout,
      isLogin: isLogin,
      getKeypair: getKeypair,
      isDataLoaded: isDataLoaded,
      isNeverUsed: isNeverUsed,
      isNew: function() {return !!data.isNew;},
      isUserPubkey: isUserPubkey,
      getData: getData,
      loadQrCode: loadQrCode,
      loadData: loadData,
      refreshData: refreshData,
      downloadSaveId: downloadSaveId,
      getCryptedId: getCryptedId,
      recoverId: recoverId,
      events: {
        add: addEvent,
        cleanByContext: cleanEventsByContext
      },
      api: api
    };
  }

  var service = factory('default', BMA);
  service.instance = factory;

  return service;
});
