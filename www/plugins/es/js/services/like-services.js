angular.module('cesium.es.like.services', ['ngResource', 'ngApi', 'cesium.services', 'cesium.config', 'cesium.es.http.services',])

    /**
     * Like service
     */
    .factory('esLike', function($q, $timeout, $rootScope, $state, $sce, $translate, $window, $filter,
                                CryptoUtils, UIUtils, csWallet, esHttp) {
      'ngInject';

      function EsLike(index, type) {
        var
          raw = {
            postSearch: esHttp.post('/like/record/_search'),
            getSearch: esHttp.get('/like/record/_search?_source=false&q=:q'),

            add: esHttp.post('/{0}/{1}/:id/_like'.format(index, type)),
            remove: esHttp.record.remove('like', 'record'),

          }
        ;


        function addLike(id, options) {
          options = options || {};
          options.kind = options.kind && options.kind.toUpperCase() || 'LIKE';
          if (!csWallet.isLogin()) return $q.reject('Wallet must be login before sending record to ES node');
          var obj = {
            version: 2,
            index: index,
            type: type,
            id: id,
            kind: options.kind
          };
          if (options.comment) obj.comment = options.comment;
          if (angular.isDefined(options.level)) obj.level = options.level;

          return raw.add(obj);
        }

        function toggleLike(id, options) {
          options = options || {};
          options.kind = options.kind || 'LIKE';
          if (!csWallet.isLogin()) return $q.reject('Wallet must be login before sending record to ES node');
          return getLikeIds(id, {kind: options.kind, issuer: csWallet.data.pubkey})
            .then(function (existingLikeIds) {
              // User already like: so remove it
              if (existingLikeIds && existingLikeIds.length) {
                return $q.all(_.map(existingLikeIds, function (likeId) {
                  return raw.remove(likeId);
                }))
                  // Return the deletion, as a delta
                  .then(function () {
                    return -1 * existingLikeIds.length;
                  });
              }
              // User not like, so add it
              else {
                return addLike(id, options)
                  // Return the insertion, as a delta
                  .then(function () {
                    return +1;
                  });
              }
            });
        }

        function getLikeIds(id, options) {
          options = options || {};
          options.kind = options.kind || 'LIKE';
          var queryString = 'index:{0} AND type:{1} AND id:{2}'.format(index, type, id);
          if (options.kind) queryString += ' AND kind:' + options.kind.toUpperCase();
          if (options.issuer) queryString += ' AND issuer:' + options.issuer;

          return raw.getSearch({q: queryString})
            .then(function (res) {
              return (res && res.hits && res.hits.hits || []).map(function (hit) {
                return hit._id;
              });
            });
        }

        function removeLike(id) {
          if (!id) throw new Error("Missing 'id' argument !");
          return raw.remove(id);
        }

        function countLikes(id, options) {
          options = options || {};
          options.kind = options.kind && options.kind.toUpperCase() || 'LIKE';
          // Get level (default to true when kind=star, otherwise false)
          options.level = angular.isDefined(options.level) ? options.level : (options.kind === 'STAR');

          var request = {
            query: {
              bool: {
                filter: [
                  {term: {index: index}},
                  {term: {type: type}},
                  {term: {id: id}},
                  {term: {kind: options.kind.toUpperCase()}}
                ]
              }
            },
            size: 0
          };

          // To known if the user already like, add 'should' on issuer, and limit to 1
          if (options.issuer) {
            request.query.bool.should = {term: {issuer: options.issuer}};
            request.size = 1;
            request._source = ["issuer"];
          }

          // Computre level AVG and issuer level
          if (options.level) {
            request.aggs = {
              level_sum: {
                sum: {field: "level"}
              }
            };
            request._source = request._source || [];
            request._source.push("level");
          }
          return raw.postSearch(request)
            .then(function (res) {
              var hits = res && res.hits;

              // Check is issuer is return (because of size=1 and should filter)
              var issuerHitIndex = hits && options.issuer ? _.findIndex(hits.hits, function (hit) {
                return hit._source.issuer === options.issuer;
              }) : -1;

              var result = {
                total: hits && hits.total || 0,
                wasHit: issuerHitIndex !== -1 || false,
                wasHitId: issuerHitIndex !== -1 && hits.hits[issuerHitIndex]._id || false
              };

              // Set level values (e.g. is kind=star)
              if (options.level) {
                result.level = issuerHitIndex !== -1 ? hits.hits[issuerHitIndex]._source.level : undefined;
                result.levelSum = res.aggregations && res.aggregations.level_sum.value || 0;

                // Compute the AVG (rounded at a precision of 0.5)
                result.levelAvg = result.total && (Math.floor((result.levelSum / result.total + 0.5) * 10) / 10 - 0.5) || 0;
              }

              return result;
            });
        }

        function loadLikes(options) {
          options = options || {};

          var filters = [
            {term: {index: index}},
            {term: {type: type}}
          ];

          var request = {
            query: {
              bool: {
                filter: filters
              }
            },
            size: options.size || 20,
            _source: ['id', 'kind', 'time', 'level', 'issuer']
          };

          if (options.kinds) {
            filters.push({terms: {
              kind: _.map(options.kinds, function(kind) {
                return kind.toUpperCase();
              })
            }});
          }
          else if (options.kind) {
            filters.push({term: {kind: options.kind.toUpperCase()}});
          }

          // To known if the user already like, add 'should' on issuer, and limit to 1
          if (options.issuer) {
            filters.push({term: {issuer: options.issuer}});
          }

          return raw.postSearch(request)
            .then(function (res) {
              if (!res || !res.hits) return;

              return {
                total: res.hits.total || 0,
                hits: res.hits.hits.reduce(function(res, item) {
                  return res.concat({
                    id: item.id,
                    time: item._source.time,
                    kind: item._source.kind,
                    level: item._source.level
                  });
                }, [])
              };
            });
        }

        return {
          toggle: toggleLike,
          load: loadLikes,
          add: addLike,
          remove: removeLike,
          count: countLikes
        };
      }

      return EsLike;
    })
;
