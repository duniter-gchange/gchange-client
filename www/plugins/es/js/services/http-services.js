angular.module('cesium.es.http.services', ['ngResource', 'ngApi', 'cesium.services', 'cesium.config'])

    /**
     * Elastic Search Http
     */
    .factory('esHttp', function($q, $timeout, $rootScope, $state, $sce, $translate, $window, $filter,
                                CryptoUtils, UIUtils, csHttp, csConfig, csSettings, csCache, BMA, csWallet, csPlatform, Api) {
      'ngInject';

      // Allow to force SSL connection with port different from 443
      var forceUseSsl = (csConfig.httpsMode === 'true' || csConfig.httpsMode === true || csConfig.httpsMode === 'force') ||
      ($window.location && $window.location.protocol === 'https:') ? true : false;
      if (forceUseSsl) {
        console.debug('[ES] [https] Enable SSL (forced by config or detected in URL)');
      }

      function EsHttp(host, port, useSsl, useCache) {

        var
            that = this,
            cachePrefix = 'esHttp-',
            constants = {
              ES_USER_API: 'GCHANGE_API',
              ES_SUBSCRIPTION_API: 'GCHANGE_SUBSCRIPTION_API',
              ES_USER_API_ENDPOINT: 'GCHANGE_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))',
              ANY_API_ENDPOINT: '([A-Z_]+)(?:[ ]+([a-z_][a-z0-9-_.ğĞ]*))?(?:[ ]+([0-9.]+))?(?:[ ]+([0-9a-f:]+))?(?:[ ]+([0-9]+))(?:\\/[^\\/]+)?',
              MAX_UPLOAD_BODY_SIZE: csConfig.plugins && csConfig.plugins.es && csConfig.plugins.es.maxUploadBodySize || 2097152 /*=2M*/,
              GCHANGE_API: 'GCHANGE_API',
              like: {
                KINDS: ['VIEW', 'LIKE', 'DISLIKE', 'FOLLOW', 'ABUSE', 'STAR']
              }
            },
            regexp = {
              IMAGE_SRC: exact('data:([A-Za-z//]+);base64,(.+)'),
              URL: match('(www\\.|https?:\/\/(www\\.)?)[-a-zA-Z0-9@:%._\\+~#=]{2,256}\\.[a-z]{2,6}\\b([-a-zA-Z0-9@:%_\\+.~#?&//=]*)'),
              HASH_TAG: match('(?:^|[\t\n\r\s ])#([0-9_-\\wḡĞǦğàáâãäåçèéêëìíîïðòóôõöùúûüýÿ]+)'),
              USER_TAG: match('(?:^|[\t\n\r\s ])@('+BMA.constants.regexp.USER_ID+')'),
              ES_USER_API_ENDPOINT: exact(constants.ES_USER_API_ENDPOINT),
              API_ENDPOINT: exact(constants.ANY_API_ENDPOINT),
            },
            fallbackNodeIndex = 0,
            listeners,
            defaultSettingsNode,
            truncUrlFilter = $filter('truncUrl');

        that.data = {
          isFallback: false
        };
        that.cache = _emptyCache();
        that.api = new Api(this, "esHttp");
        that.started = false;
        that.init = init;

        init(host, port, useSsl, useCache);
        that.useCache = angular.isDefined(useCache) ? useCache : false; // need here because used in get() function

        function init(host, port, useSsl, useCache) {
          // Use settings as default
          if (!host && csSettings.data) {
            host = host || (csSettings.data.plugins && csSettings.data.plugins.es ? csSettings.data.plugins.es.host : null);
            port = port || (host ? csSettings.data.plugins.es.port : null);
            useSsl = angular.isDefined(useSsl) ? useSsl : (port == 443 || csSettings.data.plugins.es.useSsl || forceUseSsl);
          }

          that.alive = false;
          that.host = host;
          that.port = port || ((useSsl || forceUseSsl) ? 443 : 80);
          that.useSsl = angular.isDefined(useSsl) ? useSsl : (that.port == 443 || forceUseSsl);

          that.server = csHttp.getServer(host, port);
        }

        function isSameNodeAsSettings(data) {
          data = data || csSettings.data;
          if (!data.plugins || !data.plugins.es) return false;

          var host = data.plugins.es.host;
          var useSsl = data.plugins.es.port == 443 || data.plugins.es.useSsl || forceUseSsl;
          var port = data.plugins.es.port || (useSsl ? 443 : 80);

          return isSameNode(host, port, useSsl);
        }

        function isSameNode(host, port, useSsl) {
          return (that.host === host) &&
              (that.port === port) &&
              (angular.isUndefined(useSsl) || useSsl == that.useSsl);
        }

        // Say if the ES node is a fallback node or the configured node
        function isFallbackNode() {
          return that.data.isFallback;
        }

        // Set fallback flag (e.g. called by ES settings, when resetting settings)
        function setIsFallbackNode(isFallback) {
          that.data.isFallback = isFallback;
        }

        function exact(regexpContent) {
          return new RegExp('^' + regexpContent + '$');
        }
        function match(regexpContent) {
          return new RegExp(regexpContent);
        }

        function _emptyCache() {
          return {
            getByPath: {},
            postByPath: {},
            wsByPath: {}
          };
        }

        function onSettingsReset(data, deferred) {
          deferred = deferred || $q.defer();

          if (that.data.isFallback) {
            // Force a restart
            if (that.started) {
              that.stop();
            }
          }

          // Reset to default values
          that.data.isFallback = false;
          defaultSettingsNode = null;

          deferred.resolve(data);
          return deferred.promise;
        }

        that.cleanCache = function() {
          console.debug('[ES] [http] Cleaning requests cache...');
          _.keys(that.cache.wsByPath).forEach(function(key) {
            var sock = that.cache.wsByPath[key];
            sock.close();
          });
          that.cache = _emptyCache();

          csCache.clear(cachePrefix);
        };

        that.copy = function(otherNode) {
          if (that.started) that.stop();
          that.init(otherNode.host, otherNode.port, otherNode.useSsl || otherNode.port == 443);
          that.data.isTemporary = false; // reset temporary flag
          return that.start(true /*skipInit*/);
        };

        // Get node time (UTC) FIXME: get it from the node
        that.date = { now : csHttp.date.now };

        that.byteCount = function (s) {
          s = (typeof s == 'string') ? s : JSON.stringify(s);
          return encodeURI(s).split(/%(?:u[0-9A-F]{2})?[0-9A-F]{2}|./).length - 1;
        };

        that.getUrl  = function(path) {
          return csHttp.getUrl(that.host, that.port, path, that.useSsl);
        };

        that.get = function (path, cacheTime) {

          cacheTime = that.useCache && cacheTime;
          var cacheKey = path + (cacheTime ? ('#'+cacheTime) : '');

          var getRequestFn = function(params) {
            if (!that.started) {
              if (!that._startPromise) {
                console.warn('[ES] [http] Trying to get [{0}] before start(). Waiting...'.format(path));
              }
              return that.ready().then(function(start) {
                if (!start) return $q.reject('ERROR.ES_CONNECTION_ERROR');
                return getRequestFn(params); // loop
              });
            }

            var request = that.cache.getByPath[cacheKey];
            if (!request) {
              if (cacheTime) {
                request =  csHttp.getWithCache(that.host, that.port, path, that.useSsl, cacheTime, null, null, cachePrefix);
              }
              else {
                request =  csHttp.get(that.host, that.port, path, that.useSsl);
              }
              that.cache.getByPath[cacheKey] = request;
            }
            return request(params);
          };

          return getRequestFn;
        };

        that.post = function(path) {
          var postRequest = function(obj, params) {
            if (!that.started) {
              if (!that._startPromise) {
                console.error('[ES] [http] Trying to post [{0}] before start()...'.format(path));
              }
              return that.ready().then(function(start) {
                if (!start) return $q.reject('ERROR.ES_CONNECTION_ERROR');
                return postRequest(obj, params); // loop
              });
            }

            var request = that.cache.postByPath[path];
            if (!request) {
              request =  csHttp.post(that.host, that.port, path, that.useSsl);
              that.cache.postByPath[path] = request;
            }
            return request(obj, params);
          };
          return postRequest;
        };

        that.ws = function(path) {
          return function() {
            var sock = that.cache.wsByPath[path];
            if (!sock || sock.isClosed()) {
              sock =  csHttp.ws(that.host, that.port, path, that.useSsl);

              // When close, remove from cache
              sock.onclose = function() {
                delete that.cache.wsByPath[path];
              };

              that.cache.wsByPath[path] = sock;
            }
            return sock;
          };
        };

        that.wsChanges = function(source) {
          var wsChanges = that.ws('/ws/_changes')();
          if (!source) return wsChanges;

          // If a source is given, send it just after connection open
          var _inheritedOpen = wsChanges.open;
          wsChanges.open = function() {
            return _inheritedOpen.call(wsChanges).then(function(sock) {
              if(sock) {
                sock.send(source);
              }
              else {
                console.warn('Trying to access ws changes, but no sock anymore... already open ?');
              }
            });
          };
          return wsChanges;
        };

        that.isAlive = function() {
          return csHttp.get(that.host, that.port, '/node/summary', that.useSsl)()
              .then(function(json) {
                var software = json && json.duniter && json.duniter.software || 'unknown';
                if (software === "gchange-pod" || software === "cesium-plus-pod") return true;
                console.error("[ES] [http] Not a Gchange Pod, but a {0} node. Please check '/summary/node'".format(software));
                return false;
              })
              .catch(function() {
                return false;
              });
        };

        // Alert user if node not reached - fix issue #
        that.checkNodeAlive = function(alive) {
          if (alive) {
            setIsFallbackNode(!isSameNodeAsSettings());
            return true;
          }
          if (angular.isUndefined(alive)) {
            return that.isAlive().then(that.checkNodeAlive);
          }

          var settings = csSettings.data.plugins && csSettings.data.plugins.es || {};

          // Remember the default node
          defaultSettingsNode = defaultSettingsNode || {
            host: settings.host,
            port: settings.port
          };

          var fallbackNode = settings.fallbackNodes && fallbackNodeIndex < settings.fallbackNodes.length && settings.fallbackNodes[fallbackNodeIndex++];
          if (!fallbackNode) {
            $translate('ERROR.ES_CONNECTION_ERROR', {server: that.server})
                .then(UIUtils.alert.info);
            return false; // stop the loop
          }
          var newServer = csHttp.getServer(fallbackNode.host, fallbackNode.port);
          UIUtils.loading.hide();
          return $translate('CONFIRM.ES_USE_FALLBACK_NODE', {old: that.server, new: newServer})
              .then(UIUtils.alert.confirm)
              .then(function (confirm) {
                if (!confirm) return false; // stop the loop

                that.cleanCache();

                that.init(fallbackNode.host, fallbackNode.port, fallbackNode.useSsl || fallbackNode.port == 443);

                // check is alive then loop
                return that.isAlive().then(that.checkNodeAlive);
              });
        };

        that.isStarted = function() {
          return that.started;
        };

        that.ready = function() {
          if (that.started) return $q.when(true);
          return that._startPromise || that.start();
        };

        that.start = function(skipInit) {
          if (that._startPromise) return that._startPromise;
          if (that.started) return $q.when(that.alive);

          that._startPromise = csPlatform.ready()
              .then(function() {

                if (!skipInit) {
                  // Init with defaults settings
                  that.init();
                }
              })
              .then(function() {
                console.debug('[ES] [http] Starting on [{0}]{1}...'.format(
                    that.server,
                    (that.useSsl ? ' (SSL on)' : '')
                ));
                var now = Date.now();

                return that.checkNodeAlive()
                    .then(function(alive) {
                      that.alive = alive;
                      if (!alive) {
                        console.error('[ES] [http] Could not start [{0}]: node unreachable'.format(that.server));
                        that.started = true;
                        delete that._startPromise;
                        fallbackNodeIndex = 0; // reset the fallback node counter
                        return false;
                      }

                      // Add listeners
                      addListeners();

                      console.debug('[ES] [http] Started in '+(Date.now()-now)+'ms');
                      that.api.node.raise.start();


                      that.started = true;
                      delete that._startPromise;
                      fallbackNodeIndex = 0; // reset the fallback node counter


                      return true;
                    });
              });
          return that._startPromise;
        };

        that.stop = function() {
          console.debug('[ES] [http] Stopping...');

          removeListeners();

          setIsFallbackNode(false); // will be re-computed during start phase
          delete that._startPromise;
          if (that.alive) {
            that.cleanCache();
            that.alive = false;
            that.started = false;
            that.api.node.raise.stop();
          }
          else {
            that.started = false;
          }
          return $q.when();
        };

        that.restart = function() {
          that.stop();
          return $timeout(that.start, 200);
        };

        function parseTagsFromText(value, prefix) {
          prefix = prefix || '#';
          var reg = prefix === '@' ? regexp.USER_TAG : regexp.HASH_TAG;
          var matches = value && reg.exec(value);
          var tags = matches && [];
          while(matches) {
            var tag = matches[1];
            if (!_.contains(tags, tag)) {
              tags.push(tag);
            }
            value = value.substr(matches.index + matches[1].length + 1);
            matches = value.length > 0 && reg.exec(value);
          }
          return tags;
        }

        function parseUrlsFromText(value) {
          var matches = value && regexp.URL.exec(value);
          var urls = matches && [];
          while(matches) {
            var url = matches[0];
            if (!_.contains(urls, url)) {
              urls.push(url);
            }
            value = value.substr(matches.index + matches[0].length + 1);
            matches = value && regexp.URL.exec(value);
          }
          return urls;
        }

        function parseMarkdownTitlesFromText(value, prefix, suffix) {
          prefix = prefix || '##';
          var reg = match('(?:^|[\\r\\s])('+prefix+'([^#></]+)' + (suffix||'') + ')');
          var matches = value && reg.exec(value);
          var lines = matches && [];
          var res = matches && [];
          while(matches) {
            var line = matches[1];
            if (!_.contains(lines, line)) {
              lines.push(line);
              res.push({
                line: line,
                title: matches[2]
              });
            }
            value = value.substr(matches.index + matches[1].length + 1);
            matches = value.length > 0 && reg.exec(value);
          }
          return res;
        }


        function escapeHtmlTags(text) {
          if (!text) return text;
          return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function parseAsHtml(text, options) {

          // Escape HTML tags
          var content = text ? escapeHtmlTags(text.trim()) : undefined;

          if (content) {
            options = options || {};
            options.tagState = options.tagState || 'app.user_lookup';
            options.nameState = options.nameState || 'app.user_identity_name';
            if (options.newLine || !angular.isDefined(options.newLine)) {
              content = content.replace(/\n/g, '<br>\n');
            }

            // Replace URL in description
            var urls = parseUrlsFromText(content);
            _.forEach(urls, function(url){
              // Make sure protocol is defined
              var href = (url.startsWith('http://') || url.startsWith('https://')) ? url : ('http://' + url);
              // Redirect URL to the function 'openLink', to open a new window if need (e.g. desktop app)
              var link = '<a on-tap=\"openLink($event, \'{0}\')\" href=\"{1}\" target="_blank">{2}</a>'.format(href, href, truncUrlFilter(url));
              content = content.replace(url, link);
            });

            // Replace hashtags
            var hashTags = parseTagsFromText(content);
            _.forEach(hashTags, function(tag){
              var link = '<a ui-sref=\"{0}({hash: \'{1}\'})\">#{2}</a>'.format(options.tagState, tag, tag);
              content = content.replace('#'+tag, link);
            });

            // Replace user tags
            var userTags = parseTagsFromText(content, '@');
            _.forEach(userTags, function(tag){
              var link = '<a ui-sref=\"{0}({name: \'{1}\'})\">@{2}</a>'.format(options.nameState, tag, tag);
              content = content.replace('@'+tag, link);
            });

            // Replace markdown titles
            var titles = parseMarkdownTitlesFromText(content, '#+[ ]*', '<br>');
            _.forEach(titles, function(matches){
              var size = matches.line.lastIndexOf('#', 5)+1;
              content = content.replace(matches.line, '<h{0}>{1}</h{2}>'.format(size, matches.title, size));
            });
          }
          return content;
        }

        function fillRecordTags(record, fieldNames) {
          fieldNames = fieldNames || ['title', 'description'];

          record.tags = fieldNames.reduce(function(res, fieldName) {
            var value = record[fieldName];
            var tags = value && parseTagsFromText(value);
            return tags ? res.concat(tags) : res;
          }, []);
        }

        function findObjectInTree(obj, attrName) {
          if (!obj) return;
          if (obj[attrName]) return obj[attrName];
          if (Array.isArray(obj)) {
            return obj.reduce(function(res, item) {
              return res ? res : findObjectInTree(item, attrName);
            }, false);
          }
          else if (typeof obj == "object") {
            return _.reduce(_.keys(obj), function (res, key) {
              return res ? res : findObjectInTree(obj[key], attrName);
            }, false);
          }
        }

        function postRecord(path, options) {
          options = options || {};
          var postRequest = that.post(path);
          return function(record, params) {
            if (!csWallet.isLogin()) return $q.reject('Wallet must be login before sending record to ES node');
            if (options.creationTime && !record.creationTime) {
              record.creationTime = moment().utc().unix();
            }
            // Always update the time - fix Cesium #572
            // Make sure time is always > previous (required by ES node)
            var now = moment().utc().unix();
            record.time = (!record.time || record.time < now) ? now : (record.time+1);

            var keypair = csWallet.data.keypair;
            var obj = angular.copy(record);
            delete obj.signature;
            delete obj.hash;
            obj.issuer = csWallet.data.pubkey;
            if (!obj.version) {
              obj.version = 2;
            }

            // Fill tags
            if (options.tagFields) {
              fillRecordTags(obj, options.tagFields);
            }

            var str = JSON.stringify(obj);

            return CryptoUtils.util.hash(str)
                .then(function(hash) {
                  return CryptoUtils.sign(hash, keypair)
                      .then(function(signature) {
                        // Prepend hash+signature
                        str = '{"hash":"{0}","signature":"{1}",'.format(hash, signature) + str.substring(1);
                        // Send data
                        return postRequest(str, params)
                            .then(function (id){

                              // Clear cache
                              csCache.clear(cachePrefix);

                              return id;
                            })
                            .catch(function(err) {
                              var bodyLength = that.byteCount(obj);
                              if (bodyLength > constants.MAX_UPLOAD_BODY_SIZE) {
                                throw {message: 'ERROR.ES_MAX_UPLOAD_BODY_SIZE', length: bodyLength};
                              }
                              throw err;
                            });
                      });
                });
          };
        }

        function countRecords(index, type, cacheTime) {
          var getRequest = that.get("/{0}/{1}/_search?size=0".format(index, type), cacheTime);
          return function(params) {
            return getRequest(params)
                .then(function(res) {
                  return res && res.hits && res.hits.total;
                });
          };
        }

        function removeRecord(index, type) {
          return function(id) {
            if (!csWallet.isLogin()) return $q.reject('Wallet must be login before sending record to ES node');

            var obj = {
              version: 2,
              index: index,
              type: type,
              id: id,
              issuer: csWallet.data.pubkey,
              time: moment().utc().unix()
            };
            var str = JSON.stringify(obj);
            return CryptoUtils.util.hash(str)
                .then(function(hash) {
                  return CryptoUtils.sign(hash, csWallet.data.keypair)
                      .then(function(signature) {
                        // Prepend hash+signature
                        str = '{"hash":"{0}","signature":"{1}",'.format(hash, signature) + str.substring(1);
                        // Send data
                        return that.post('/history/delete')(str)
                            .then(function (id) {
                              return id;
                            });
                      });
                });
          };
        }

        function addLike(index, type) {
          var postRequest = postRecord('/{0}/{1}/:id/_like'.format(index, type));
          return function(id, options) {
            options = options || {};
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

            return postRequest(obj);
          };
        }

        function toggleLike(index, type) {
          var getIdsRequest = getLikeIds(index, type);
          var addRequest = addLike(index, type);
          var removeRequest = removeRecord('like', 'record');
          return function(id, options) {
            options = options || {};
            options.kind = options.kind || 'LIKE';
            if (!csWallet.isLogin()) return $q.reject('Wallet must be login before sending record to ES node');
            return getIdsRequest(id, {kind: options.kind, issuer: csWallet.data.pubkey})
                .then(function(existingLikeIds) {
                  // User already like: so remove it
                  if (existingLikeIds && existingLikeIds.length) {
                    return $q.all(_.map(existingLikeIds, function(likeId) {
                      return removeRequest(likeId);
                    }))
                    // Return the deletion, as a delta
                    .then(function() {
                      return -1 * existingLikeIds.length;
                    });
                  }
                  // User not like, so add it
                  else {
                    return addRequest(id, options)
                        // Return the insertion, as a delta
                        .then(function() {
                          return +1;
                        });
                  }
                });
          };
        }

        function getLikeIds(index, type) {
          var searchRequest = that.get('/like/record/_search?_source=false&q=:q');
          var baseQueryString = 'index:{0} AND type:{1} AND id:'.format(index, type);
          return function(id, options) {
            options = options || {};
            options.kind = options.kind || 'LIKE';
            var queryString = baseQueryString + id;
            if (options.kind) queryString += ' AND kind:' + options.kind.toUpperCase();
            if (options.issuer) queryString += ' AND issuer:' + options.issuer;

            return searchRequest({q: queryString})
                .then(function(res) {
                  return (res && res.hits && res.hits.hits || []).map(function(hit) {
                    return hit._id;
                  });
                });

          };
        }

        function removeLike(index, type) {
          var removeRequest = removeRecord('like', 'record');
          return function(id) {
            if (id) {
              return removeRequest(id);
            }
            // Get the ID
            else {

            }
          };
        }

        function countLikes(index, type) {
          var searchRequest = that.post("/like/record/_search");
          return function(id, options) {
            options = options || {};
            options.kind = options.kind && options.kind.toUpperCase() || 'LIKE';
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
              request._source = request._source || [];
              request._source.push("level");
            }
            return searchRequest(request)
                .then(function(res) {
                  var hits = res && res.hits;

                  // Check is issuer is return (because of size=1 and should filter)
                  var issuerHitIndex = hits && options.issuer ? _.findIndex(hits.hits, function(hit) {
                    return hit._source.issuer === options.issuer;
                  }) : -1;

                  var result = {
                    total: hits && hits.total || 0,
                    wasHit: issuerHitIndex !== -1 || false,
                    wasHitId: issuerHitIndex !== -1 && hits.hits[issuerHitIndex]._id || false
                  };

                  // Set level values (e.g. is kind=star)
                  if (options.level) {
                    result.level= issuerHitIndex !== -1  ? hits.hits[issuerHitIndex]._source.level : undefined;
                    result.levelSum = res.aggregations && res.aggregations.level_sum.value || 0;

                    // Compute the AVG (rounded at a precision of 0.5)
                    result.levelAvg = result.total && (Math.floor((result.levelSum / result.total + 0.5) * 10) / 10 - 0.5) || 0;
                  }

                  return result;
                });
          };
        }

        function loadLikes(index, type) {
          var searchRequest = that.post("/like/record/_search");
          return function(id, options) {
            options = options || {};
            options.kind = options.kind && options.kind.toUpperCase() || 'LIKE';
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
              request._source = request._source || [];
              request._source.push("level");
            }
            return searchRequest(request)
              .then(function(res) {
                var hits = res && res.hits;

                // Check is issuer is return (because of size=1 and should filter)
                var issuerHitIndex = hits && options.issuer ? _.findIndex(hits.hits, function(hit) {
                  return hit._source.issuer === options.issuer;
                }) : -1;

                var result = {
                  total: hits && hits.total || 0,
                  wasHit: issuerHitIndex !== -1 || false,
                  wasHitId: issuerHitIndex !== -1 && hits.hits[issuerHitIndex]._id || false
                };

                // Set level values (e.g. is kind=star)
                if (options.level) {
                  result.level= issuerHitIndex !== -1  ? hits.hits[issuerHitIndex]._source.level : undefined;
                  result.levelSum = res.aggregations && res.aggregations.level_sum.value || 0;

                  // Compute the AVG (rounded at a precision of 0.5)
                  result.levelAvg = result.total && (Math.floor((result.levelSum / result.total + 0.5) * 10) / 10 - 0.5) || 0;
                }

                return result;
              });
          };
        }

        that.image = {};

        function imageFromAttachment(attachment) {
          if (!attachment || !attachment._content_type || !attachment._content || attachment._content.length === 0) {
            return null;
          }
          var image = {
            src: "data:" + attachment._content_type + ";base64," + attachment._content
          };
          if (attachment._title) {
            image.title = attachment._title;
          }
          if (attachment._name) {
            image.name = attachment._name;
          }
          return image;
        }

        function imageToAttachment(image) {
          if (!image || !image.src) return null;
          var match = regexp.IMAGE_SRC.exec(image.src);
          if (!match) return null;
          var attachment = {
            _content_type: match[1],
            _content: match[2]
          };
          if (image.title) {
            attachment._title = image.title;
          }
          if (image.name) {
            attachment._name = image.name;
          }
          return attachment;
        }

        /**
         * This will create a image (src, title, name) using the _content is present, or computing a image URL to the ES node
         * @param host
         * @param port
         * @param hit
         * @param imageField
         * @returns {{}}
         */
        that.image.fromHit = function(hit, imageField) {
          if (!hit || !hit._source) return;
          var attachment =  hit._source[imageField];
          if (!attachment || !attachment._content_type || !attachment._content_type.startsWith("image/")) return;
          var image = {};
          // If full content: then use it directly
          if (attachment._content) {
            image.src = "data:" + attachment._content_type + ";base64," + attachment._content;
          }
          // Compute an url
          else {
            var extension = attachment._content_type.substr(6);
            var path = [hit._index, hit._type, hit._id, '_image', imageField].join('/');
            path = '/' + path + '.' + extension;
            image.src = that.getUrl(path);
          }
          if (attachment._title) {
            image.title = attachment._title;
          }
          if (attachment._name) {
            image.name = attachment._name;
          }
          return image;
        };

        function parseEndPoint(endpoint) {
          var matches = regexp.API_ENDPOINT.exec(endpoint);
          if (!matches) return;
          return {
            "api": matches[1] || '',
            "dns": matches[2] || '',
            "ipv4": matches[3] || '',
            "ipv6": matches[4] || '',
            "port": matches[5] || 80,
            "path": matches[6] || '',
            "useSsl": matches[5] == 443
          };
        }

        function emptyHit() {
          return {
            _id: null,
            _index: null,
            _type: null,
            _version: null,
            _source: {}
          };
        }

        function addListeners() {
          // Watch some service events
          listeners = [
            csSettings.api.data.on.reset($rootScope, onSettingsReset, that)
          ];
        }

        function removeListeners() {
          _.forEach(listeners, function(remove){
            remove();
          });
          listeners = [];
        }

        // Define events
        that.api.registerEvent('node', 'start');
        that.api.registerEvent('node', 'stop');

        var exports = {
          getServer: csHttp.getServer,
          node: {
            summary: that.get('/node/summary'),
            parseEndPoint: parseEndPoint,
            same: isSameNode,
            sameAsSettings: isSameNodeAsSettings,
            isFallback: isFallbackNode
          },
          websocket: {
            changes: that.wsChanges,
            block: that.ws('/ws/block'),
            peer: that.ws('/ws/peer')
          },
          wot: {
            member: {
              uids : that.get('/wot/members')
            }
          },
          network: {
            peering: {
              self: that.get('/network/peering')
            },
            peers: that.get('/network/peers')
          },
          record: {
            post: postRecord,
            remove: removeRecord,
            count : countRecords
          },
          like: {
            toggle: toggleLike,
            add: addLike,
            remove: removeLike,
            count: countLikes
          },
          image: {
            fromAttachment: imageFromAttachment,
            toAttachment: imageToAttachment
          },
          hit: {
            empty: emptyHit
          },
          util: {
            parseTags: parseTagsFromText,
            parseAsHtml: parseAsHtml,
            escapeHtmlTags: escapeHtmlTags,
            findObjectInTree: findObjectInTree
          },
          cache: csHttp.cache,
          constants: constants
        };
        exports.constants.regexp = regexp;
        angular.merge(that, exports);
      }


      var service = new EsHttp(undefined, undefined, undefined, true);

      service.instance = function(host, port, useSsl, useCache) {
        return new EsHttp(host, port, useSsl, useCache);
      };

      service.lightInstance = function(host, port, useSsl, timeout) {
        port = port || 80;
        useSsl = angular.isDefined(useSsl) ? useSsl : (+port === 443);

        function countHits(path, params) {
          return csHttp.get(host, port, path)(params)
              .then(function(res) {
                return res && res.hits && res.hits.total;
              });
        }

        function countRecords(index, type) {
          return countHits("/{0}/{1}/_search?size=0".format(index, type));
        }

        function countSubscriptions(params) {
          var queryString = _.keys(params||{}).reduce(function(res, key) {
            return (res && (res + " AND ") || "") + key + ":" + params[key];
          }, '');
          return countHits("/subscription/record/_search?size=0&q=" + queryString);
        }

        return {
          host: host,
          port: port,
          useSsl: useSsl,
          node: {
            summary: csHttp.getWithCache(host, port, '/node/summary', useSsl, csHttp.cache.LONG, false, timeout)
          },
          network: {
            peering: {
              self: csHttp.get(host, port, '/network/peering', useSsl, timeout)
            },
            peers: csHttp.get(host, port, '/network/peers', useSsl, timeout)
          },
          blockchain: {
            current: csHttp.get(host, port, '/blockchain/current?_source=number,hash,medianTime', useSsl, timeout)
          },
          record: {
            count: countRecords
          },
          subscription: {
            count: countSubscriptions
          }
        };
      };

      return service;
    })
;
