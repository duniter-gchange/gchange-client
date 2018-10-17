angular.module('cesium.graph.data.services', ['cesium.es.http.services'])

  .factory('gpData', function($rootScope, $q, $timeout, esHttp, BMA, csCache) {
    'ngInject';

    var
      currencyCache = csCache.get('gpData-currency-', csCache.constants.SHORT),
      exports = {
        node: {},
        wot: {},
        blockchain: {},
        docstat: {},
        synchro: {
          execution: {}
        },
        raw: {
          block: {
            search: esHttp.post('/:currency/block/_search')
          },
          blockstat: {
            search: esHttp.post('/:currency/blockstat/_search')
          },
          movement: {
            search: esHttp.post('/:currency/movement/_search')
          },
          user: {
            event: esHttp.post('/user/event/_search?pretty')
          },
          docstat: {
            search: esHttp.post('/docstat/record/_search')
          },
          synchro: {
            search: esHttp.post('/:currency/synchro/_search')
          }
        },
        regex: {
        }
      };

    function _powBase(amount, base) {
      return base <= 0 ? amount : amount * Math.pow(10, base);
    }

    function _initRangeOptions(options) {
      options = options || {};
      options.maxRangeSize = options.maxRangeSize || 30;
      options.defaultTotalRangeCount = options.defaultTotalRangeCount || options.maxRangeSize*2;

      options.rangeDuration = options.rangeDuration || 'day';
      options.endTime = options.endTime || moment().utc().add(1, options.rangeDuration).unix();
      options.startTime = options.startTime ||
        moment.unix(options.endTime).utc().subtract(options.defaultTotalRangeCount, options.rangeDuration).unix();
      // Make to sure startTime is never before the currency starts - fix #483
      if (options.firstBlockTime && options.startTime < options.firstBlockTime) {
        options.startTime = options.firstBlockTime;
      }
      return options;
    }


    /**
     * Graph: "statictics on ES documents"
     * @param currency
     * @returns {*}
     */
    exports.docstat.get = function(options) {

      options = _initRangeOptions(options);

      var jobs = [];

      var from = moment.unix(options.startTime).utc().startOf(options.rangeDuration);
      var to = moment.unix(options.endTime).utc().startOf(options.rangeDuration);
      var ranges = [];
      while(from.isBefore(to)) {

        ranges.push({
          from: from.unix(),
          to: from.add(1, options.rangeDuration).unix()
        });

        // Flush if max range count, or just before loop condition end (fix #483)
        var flush = (ranges.length === options.maxRangeSize) || !from.isBefore(to);
        if (flush) {
          var request = {
            size: 0,
            aggs: {
              range: {
                range: {
                  field: "time",
                  ranges: ranges
                },
                aggs: {
                  index : {
                    terms: {
                      field: "index",
                      size: 0
                    },
                    aggs: {
                      type: {
                        terms: {
                          field: "indexType",
                          size: 0
                        },
                        aggs: {
                          max: {
                            max: {
                              field : "count"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }

          };

          // prepare next loop
          ranges = [];
          var indices = {};

          if (jobs.length == 10) {
            console.error('Too many parallel jobs!');
            from = moment.unix(options.endTime).utc(); // stop while
          }
          else {
            jobs.push(
              exports.raw.docstat.search(request)
                .then(function (res) {
                  var aggs = res.aggregations;
                  return (aggs.range && aggs.range.buckets || []).reduce(function (res, agg) {
                    var item = {
                      from: agg.from,
                      to: agg.to
                    };
                    _.forEach(agg.index && agg.index.buckets || [], function (agg) {
                      var index = agg.key;
                      _.forEach(agg.type && agg.type.buckets || [], function (agg) {
                        var key = (index + '_' + agg.key);
                        item[key] = agg.max.value;
                        if (!indices[key]) indices[key] = true;
                      });
                    });
                    return res.concat(item);
                  }, []);
                })
            );
          }
        }
      } // loop

      return $q.all(jobs)
        .then(function(res) {
          res = res.reduce(function(res, hits){
            if (!hits || !hits.length) return res;
            return res.concat(hits);
          }, []);

          res = _.sortBy(res, 'from');

          return _.keys(indices).reduce(function(series, index) {
            series[index] = _.pluck(res, index);
            return series;
          }, {
            times: _.pluck(res, 'from')
          });
        });
    };


    /**
     * Graph: "statictics on ES documents"
     * @param currency
     * @returns {*}
     */
    exports.synchro.execution.get = function(options) {

      options = _initRangeOptions(options);

      var jobs = [];

      var from = moment.unix(options.startTime).utc().startOf(options.rangeDuration);
      var to = moment.unix(options.endTime).utc().startOf(options.rangeDuration);
      var ranges = [];
      while(from.isBefore(to)) {

        ranges.push({
          from: from.unix(),
          to: from.add(1, options.rangeDuration).unix()
        });

        // Flush if max range count, or just before loop condition end (fix #483)
        var flush = (ranges.length === options.maxRangeSize) || !from.isBefore(to);
        if (flush) {
          var request = {
            size: 0,
            aggs: {
              range: {
                range: {
                  field: "time",
                  ranges: ranges
                },
                aggs: {
                  api: {
                    terms: {
                      field: "api",
                      size: 0
                    },
                    aggs: {
                      peer_count: {
                        cardinality: {
                          field: "peer"
                        }
                      }
                    }
                  },
                  duration: {
                    sum: {
                      field: "executionTime"
                    }
                  },
                  result: {
                    nested: {
                      path: "result"
                    },
                    aggs: {
                      inserts : {
                        sum: {
                          field : "result.inserts"
                        }
                      },
                      updates : {
                        sum: {
                          field : "result.updates"
                        }
                      },
                      deletes : {
                        sum: {
                          field : "result.deletes"
                        }
                      }
                    }
                  }
                }
              }
            }

          };

          // prepare next loop
          ranges = [];
          var apis = {};

          if (jobs.length == 10) {
            console.error('Too many parallel jobs!');
            from = moment.unix(options.endTime).utc(); // stop while
          }
          else {
            jobs.push(
              exports.raw.synchro.search(request, {currency: options.currency})
                .then(function (res) {
                  var aggs = res.aggregations;

                  return (aggs.range && aggs.range.buckets || []).reduce(function (res, agg) {
                    var item = {
                      from: agg.from,
                      to: agg.to,
                      inserts: agg.result.inserts.value,
                      updates: agg.result.inserts.value,
                      deletes: agg.result.deletes.value,
                      duration: agg.duration.value
                    };
                    _.forEach(agg.api && agg.api.buckets || [], function (api) {
                      item[api.key] = api.peer_count && api.peer_count.value || 0;
                      if (!apis[api.key]) apis[api.key] = true;
                    });

                    return res.concat(item);
                  }, []);
                })
            );
          }
        }
      } // loop

      return $q.all(jobs)
        .then(function(res) {
          res = res.reduce(function(res, hits){
            if (!hits || !hits.length) return res;
            return res.concat(hits);
          }, []);

          res = _.sortBy(res, 'from');

          var series = {
            times: _.pluck(res, 'from'),
            inserts: _.pluck(res, 'inserts'),
            updates: _.pluck(res, 'updates'),
            deletes: _.pluck(res, 'deletes'),
            duration: _.pluck(res, 'duration')
          };

          _.keys(apis).forEach(function(api) {
            series[api] = _.pluck(res, api);
          });

          return series;
        });
    };

    return exports;
  })



;
