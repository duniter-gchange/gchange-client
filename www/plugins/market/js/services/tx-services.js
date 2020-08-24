angular.module('cesium.market.tx.services', ['cesium.services', 'cesium.es.services',
  'cesium.market.settings.services', 'cesium.market.record.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('mkTx');
    }

  })

.factory('mkTx', function($rootScope, $q, csSettings, csPlatform, CryptoUtils, csConfig, esHttp, mkRecord) {
  'ngInject';

  var
    listeners,
    constants= {
      COMMENTS_PREFIX: "GCHANGE"
    },
    raw = {
      postSearchByCurrency: {
        g1: esHttp.post('/g1/movement/_search')
      },
    };

  function getRecordPrefix(record) {
    if (!record || !record.id) throw Error('Missing record or record.id');
    return [constants.COMMENTS_PREFIX, record.id].join(':').toUpperCase();
  }

  function postSearch(currency, request) {
    var fn = raw.postSearchByCurrency[currency];
    if (!fn) {
      fn = esHttp.post('/'+currency+'/movement/_search')
      raw.postSearchByCurrency[currency] = fn;
    }
    return fn(request);
  }

  function fillRecordTx(record, options) {
    options = options || {};
    options.withAvg = angular.isDefined(options.withAvg) ? options.withAvg : false;

    var now = Date.now();
    console.debug("[market] [tx] Loading TX stats of record {{0}}...".format(record.id));

    // Compute prefix, if need
    options.prefix = options.prefix || getRecordPrefix(record);

    var request = {
      size: 0,
      query: {
        bool: {
          filter: [
            {term : {recipient : record.issuer}}
          ],
          must: {
            prefix: {
              comment: options.prefix
            }
          }
        }
      },
      aggs: {
        amount_sum: {
          sum : { field : "amount" }
        }
      }
    };

    if (options.withAvg) {
      request.aggs['amount_avg'] = {
        avg : { field : "amount" }
      };
    }

    return postSearch(record.currency, request)
      .then(function (res) {
        var sum = res.aggregations && res.aggregations.amount_sum && res.aggregations.amount_sum.value;
        var pct = record.price > 0 ?
          (sum * 100 / record.price)
          : undefined;
        record.tx = {
          sum: sum,
          pct: pct
        };
        if (options.withAvg) {
          record.sum = res.aggregations && res.aggregations.amount_avg && res.aggregations.amount_avg.value;
        }
        console.debug("[market] [tx] TX stats loaded in {1}ms".format(record.id, Date.now() - now), record.tx);

        return record;
      })
  }

  function onRecordSearch(records, deferred) {
    deferred = deferred || $q.defer();

    var jobs = (records||[]).reduce(function(res, record){
      // Crowdfunding
      if (record.type === 'crowdfunding') {
        return res.concat(fillRecordTx(record));
      }
      return res;
    }, []);

    if (jobs.length) {
      $q.all(jobs)
        .then(deferred.resolve)
        .catch(deferred.reject);
    }
    else {
      // Nothing to process
      deferred.resolve();
    }
    return deferred.promise;
  }

  function onRecordLoad(record, deferred) {
    deferred = deferred || $q.defer();

    // Crowdfunding
    if (record.type === 'crowdfunding') {
      return fillRecordTx(record, {withAvg: true})
        .then(deferred.resolve)
        .catch(deferred.reject);
    }

    else {
      // Nothing to process
      deferred.resolve();
    }
    return deferred.promise;
  }

  function computeTxUris(options) {
    if (!options || !options.pubkey) return $q.reject('Missing options.pubkey');
    options.currency = options.currency || 'g1';

    if (options.currency === 'g1') {
      var uri = 'june://' + options.pubkey;
      var uriParams = [];
      if (options.amount) {
        uriParams.push('amount=' + options.amount / 100);
      }
      if (options.comment) {
        uriParams.push('comment=' + options.comment);
      }
      if (uriParams.length) {
        uri += '?' + uriParams.join('&');
      }

      // TODO: add g1.duniter.org
      return $q.when([
        uri,
        'web+' + uri
      ]);
    }

    return $q.when([]);

  }

  function addListeners() {
    // Extend csWot events
    listeners = [
      mkRecord.api.record.on.search($rootScope, onRecordSearch, this),
      mkRecord.api.record.on.load($rootScope, onRecordLoad, this)
    ];
  }


  // Default actions
  addListeners();

  return {
    record: {
      computePrefix: getRecordPrefix,
      fillTx: fillRecordTx
    },
    uri: {
      compute: computeTxUris
    },
    constants : constants
  };
})
;