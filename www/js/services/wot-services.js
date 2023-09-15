
angular.module('cesium.wot.services', ['ngApi', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services',
  'cesium.settings.services'])

.factory('csWot', function($q, $timeout, BMA, Api, CacheFactory, csConfig, csCurrency, csSettings, csCache) {
  'ngInject';

  function factory(id) {

    var
      api = new Api(this, "csWot-" + id),
      identityCache = csCache.get('csWot-idty-', csCache.constants.SHORT),

      // Add id, and remove duplicated id
      _addUniqueIds = function(idties) {
        var idtyKeys = {};
        return idties.reduce(function(res, idty) {
          idty.id = idty.id || idty.uid + '-' + idty.pubkey;
          if (!idtyKeys[idty.id]) {
            idtyKeys[idty.id] = true;
            return res.concat(idty);
          }
          return res;
        }, []);
      },

      _sortAndSliceIdentities = function(idties, offset, size) {
        offset = offset || 0;

        // Add unique ids
        idties = _addUniqueIds(idties);

        // Sort by block and
        idties = _.sortBy(idties, function(idty){
          var score = 1;
          score += (1000000 * (idty.block));
          score += (10      * (900 - idty.uid.toLowerCase().charCodeAt(0)));
          return -score;
        });
        if (angular.isDefined(size) && idties.length > size) {
          idties = idties.slice(offset, offset+size); // limit if more than expected size
        }


        return idties;
      },

      _sortCertifications = function(certifications) {
        certifications = _.sortBy(certifications, function(cert){
          var score = 1;
          score += (1000000000000 * (cert.expiresIn ? cert.expiresIn : 0));
          score += (10000000      * (cert.isMember ? 1 : 0));
          score += (10            * (cert.block ? cert.block : 0));
          return -score;
        });
        return certifications;
      },

      loadRequirements = function(pubkey, uid) {
        if (!pubkey) return $q.when({});
        // Get requirements
        return BMA.wot.requirements({pubkey: pubkey})
          .then(function(res){
            if (!res.identities || !res.identities.length)  return;

            // Sort to select the best identity
            if (res.identities.length > 1) {
              // Select the best identity, by sorting using this order
              //  - same wallet uid
              //  - is member
              //  - has a pending membership
              //  - is not expired (in sandbox)
              //  - is not outdistanced
              //  - if has certifications
              //      max(count(certification)
              //    else
              //      max(membershipPendingExpiresIn) = must recent membership
              res.identities = _.sortBy(res.identities, function(idty) {
                var score = 0;
                score += (10000000000 * ((uid && idty.uid === uid) ? 1 : 0));
                score += (1000000000  * (idty.membershipExpiresIn > 0 ? 1 : 0));
                score += (100000000   * (idty.membershipPendingExpiresIn > 0 ? 1 : 0));
                score += (10000000    * (!idty.expired ? 1 : 0));
                score += (1000000     * (!idty.outdistanced ? 1 : 0));
                var certCount = !idty.expired && idty.certifications ? idty.certifications.length : 0;
                score += (1         * (certCount ? certCount : 0));
                score += (1         * (!certCount && idty.membershipPendingExpiresIn > 0 ? idty.membershipPendingExpiresIn/1000 : 0));
                return -score;
              });
              console.debug('Found {0} identities. Will selected the best one'.format(res.identities.length));
            }
            var requirements = res.identities[0];
            // Add useful custom fields
            requirements.hasSelf = true;
            requirements.needMembership = (requirements.membershipExpiresIn <= 0 &&
                                           requirements.membershipPendingExpiresIn <= 0 );
            requirements.needRenew = (!requirements.needMembership &&
                                      requirements.membershipExpiresIn <= csSettings.data.timeWarningExpire &&
                                      requirements.membershipPendingExpiresIn <= 0 );
            requirements.canMembershipOut = (requirements.membershipExpiresIn > 0);
            requirements.pendingMembership = (requirements.membershipExpiresIn <= 0 && requirements.membershipPendingExpiresIn > 0);
            requirements.isMember = (requirements.membershipExpiresIn > 0);
            // Force certification count to 0, is not a member yet - fix #269
            requirements.certificationCount = (requirements.isMember && requirements.certifications) ? requirements.certifications.length : 0;
            requirements.willExpireCertificationCount = requirements.certifications ? requirements.certifications.reduce(function(count, cert){
              if (cert.expiresIn <= csSettings.data.timeWarningExpire) {
                cert.willExpire = true;
                return count + 1;
              }
              return count;
            }, 0) : 0;
            requirements.pendingRevocation = !requirements.revoked && !!requirements.revocation_sig;

            return requirements;
          })
          .catch(function(err) {
            // If not a member: continue
            if (!!err &&
                (err.ucode == BMA.errorCodes.NO_MATCHING_MEMBER ||
                 err.ucode == BMA.errorCodes.NO_IDTY_MATCHING_PUB_OR_UID)) {
              return {
                hasSelf: false,
                needMembership: true,
                canMembershipOut: false,
                needRenew: false,
                pendingMembership: false,
                needCertifications: false,
                needCertificationCount: 0,
                willNeedCertificationCount: 0
              };
            }
            throw err;
          });
      },

      loadIdentityByLookup = function(pubkey, uid) {
        return BMA.wot.lookup({ search: pubkey||uid })
          .then(function(res) {
            if (!res || !res.results || !res.results.length) {
              return {
                uid: null,
                pubkey: pubkey,
                hasSelf: false
              };
            }
            var identities = res.results.reduce(function(idties, res) {
              return idties.concat(res.uids.reduce(function(uids, idty) {
                var blockUid = idty.meta.timestamp.split('-', 2);
                return uids.concat({
                  uid: idty.uid,
                  pubkey: res.pubkey,
                  timestamp: idty.meta.timestamp,
                  number: parseInt(blockUid[0]),
                  hash: blockUid[1],
                  revoked: idty.revoked,
                  revocationNumber: idty.revoked_on,
                  sig: idty.self
                });
              }, []));
            }, []);

            // Sort identities if need
            if (identities.length) {
              // Select the best identity, by sorting using this order
              //  - same given uid
              //  - not revoked
              //  - max(block_number)
              identities = _.sortBy(identities, function(idty) {
                var score = 0;
                score += (10000000000 * ((uid && idty.uid === uid) ? 1 : 0));
                score += (1000000000  * (!idty.revoked ? 1 : 0));
                score += (1           * (idty.number ? idty.number : 0));
                return -score;
              });
            }
            var identity = identities[0];

            // Retrieve time (self and revocation)
            var blocks = [identity.number];
            if (identity.revocationNumber) {
              blocks.push(identity.revocationNumber);
            }
            return BMA.blockchain.blocks(blocks)
              .then(function(blocks){
                identity.sigDate = blocks[0].medianTime;

                // Check if self has been done on a valid block
                if (identity.number !== 0 && identity.hash !== blocks[0].hash) {
                  identity.hasBadSelfBlock = true;
                }

                // Set revocation time
                if (identity.revocationNumber) {
                  identity.revocationTime = blocks[1].medianTime;
                }

                return identity;
              })
              .catch(function(err){
                // Special case for currency init (root block not exists): use now
                if (err && err.ucode == BMA.errorCodes.BLOCK_NOT_FOUND && identity.number === 0) {
                  identity.sigDate = csCurrency.date.now();
                  return identity;
                }
                else {
                  throw err;
                }
              });
          })
          .catch(function(err) {
            if (!!err && err.ucode == BMA.errorCodes.NO_MATCHING_IDENTITY) { // Identity not found (if no self)
              var identity = {
                uid: null,
                pubkey: pubkey,
                hasSelf: false
              };
              return identity;
            }
            else {
              throw err;
            }
          });
      },

      loadData = function(pubkey, withCache, uid, force) {

        var data;

        if (!pubkey && uid && !force) {
          return BMA.wot.member.getByUid(uid)
            .then(function(member) {
              if (member) return loadData(member.pubkey, withCache, member.uid); // recursive call
              //throw {message: 'NOT_A_MEMBER'};
              return loadData(pubkey, withCache, uid, true/*force*/);
            });
        }

        // Check cached data
        if (pubkey) {
          data = withCache ? identityCache.get(pubkey) : null;
          if (data && (!uid || data.uid == uid)) {
            console.debug("[wot] Identity " + pubkey.substring(0, 8) + " found in cache");
            return $q.when(data);
          }
          console.debug("[wot] Loading identity " + pubkey.substring(0, 8) + "...");
          data = {pubkey: pubkey};
        }
        else {
          console.debug("[wot] Loading identity from uid " + uid);
          data = {};
        }

        var now = Date.now();

        var parameters;
        var medianTime;

        return $q.all([
            // Get parameters
            csCurrency.parameters()
              .then(function(res) {
                parameters = res;
                data.sigQty =  parameters.sigQty;
                data.sigStock =  parameters.sigStock;
              }),
            // Get current time
            csCurrency.blockchain.current()
              .then(function(current) {
                medianTime = current.medianTime;
              })
              .catch(function(err){
                // Special case for currency init (root block not exists): use now
                if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) {
                  medianTime = Math.trunc(new Date().getTime()/1000);
                }
                else {
                  throw err;
                }
              }),

            // Get identity using lookup
            loadIdentityByLookup(pubkey, uid)
              .then(function (identity) {
                  angular.merge(data, identity);
              })
          ])
          .then(function() {

            // API extension
            return api.data.raisePromise.load(data)
              .catch(function(err) {
                console.debug('Error while loading identity data, on extension point.');
                console.error(err);
              });
          })
          .then(function() {
            if (!data.pubkey) return undefined; // not found
            delete data.lookup; // not need anymore
            identityCache.put(data.pubkey, data); // add to cache
            console.debug('[wot] Identity '+ data.pubkey.substring(0, 8) +' loaded in '+ (Date.now()-now) +'ms');
            return data;
          });
      },

      search = function(text, options) {
        if (!text || text.trim() !== text) {
          return $q.when(undefined);
        }

        // Remove first special characters (to avoid request error)
        var safeText = text.replace(/(^|\s)#\w+/g, ''); // remove tags
        safeText = safeText.replace(/[^a-zA-Z0-9_-\s]+/g, '');
        safeText = safeText.replace(/\s+/g, ' ').trim();

        options = options || {};
        options.addUniqueId = angular.isDefined(options.addUniqueId) ? options.addUniqueId : true;
        options.allowExtension = angular.isDefined(options.allowExtension) ? options.allowExtension : true;
        options.excludeRevoked = angular.isDefined(options.excludeRevoked) ? options.excludeRevoked : false;

        var promise;
        if (!safeText) {
          promise = $q.when([]);
        }
        else {
          promise = $q.all(
            safeText.split(' ').reduce(function(res, text) {
              console.debug('[wot] Will search on: \'' + text + '\'');
              return res.concat(BMA.wot.lookup({ search: text }));
            }, [])
          ).then(function(res){
              return res.reduce(function(idties, res) {
                return idties.concat(res.results.reduce(function(idties, res) {
                  return idties.concat(res.uids.reduce(function(uids, idty) {
                    var blocUid = idty.meta.timestamp.split('-', 2);
                    var revoked = !idty.revoked && idty.revocation_sig;
                    if (!options.excludeRevoked || !revoked) {
                      return uids.concat({
                        uid: idty.uid,
                        pubkey: res.pubkey,
                        number: blocUid[0],
                        hash: blocUid[1],
                        revoked: revoked
                      });
                    }
                    return uids;
                  }, []));
                }, []));
              }, []);
            })
            .catch(function(err) {
              if (err && err.ucode == BMA.errorCodes.NO_MATCHING_IDENTITY) {
                return [];
              }
              else {
                throw err;
              }
            });
        }

        return promise
          .then(function(idties) {
            if (!options.allowExtension) {
              // Add unique id (if enable)
              return options.addUniqueId ? _addUniqueIds(idties) : idties;
            }
            var lookupResultCount = idties.length;
            // call extension point
            return api.data.raisePromise.search(text, idties, 'pubkey')
              .then(function() {

                // Make sure to add uid to new results - fix #488
                if (idties.length > lookupResultCount) {
                  var idtiesWithoutUid = _.filter(idties, function(idty) {
                    return !idty.uid && idty.pubkey;
                  });
                  if (idtiesWithoutUid.length) {
                    return BMA.wot.member.uids()
                      .then(function(uids) {
                        _.forEach(idties, function(idty) {
                          if (!idty.uid && idty.pubkey) {
                            idty.uid = uids[idty.pubkey];
                          }
                        });
                      });
                  }
                }
              })
              .then(function() {
                // Add unique id (if enable)
                return options.addUniqueId ? _addUniqueIds(idties) : idties;
              });
          });
      },

      getNewcomers = function(offset, size) {
        offset = offset || 0;
        size = size || 20;
        return BMA.blockchain.stats.newcomers()
          .then(function(res) {
            if (!res.result.blocks || !res.result.blocks.length) {
              return null;
            }
            var blocks = _.sortBy(res.result.blocks, function (n) {
              return -n;
            });
            return getNewcomersRecursive(blocks, 0, 5, offset+size);
          })
          .then(function(idties){
            if (!idties || !idties.length) {
              return null;
            }
            idties = _sortAndSliceIdentities(idties, offset, size);

            // Extension point
            return extendAll(idties, 'pubkey', true/*skipAddUid*/);
          });
      },


      getNewcomersRecursive = function(blocks, offset, size, maxResultSize) {
        return $q(function(resolve, reject) {
          var result = [];
          var jobs = [];
          _.each(blocks.slice(offset, offset+size), function(number) {
            jobs.push(
              BMA.blockchain.block({block: number})
                .then(function(block){
                  if (!block || !block.joiners) return;
                  _.each(block.joiners, function(joiner){
                    var parts = joiner.split(':');
                    var idtyKey = parts[parts.length-1]/*uid*/ + '-' + parts[0]/*pubkey*/;
                    result.push({
                      id: idtyKey,
                      uid: parts[parts.length-1],
                      pubkey:parts[0],
                      memberDate: block.medianTime,
                      block: block.number
                    });
                  });
                })
            );
          });

          $q.all(jobs)
            .then(function() {
              if (result.length < maxResultSize && offset < blocks.length - 1) {
                $timeout(function() {
                  getNewcomersRecursive(blocks, offset+size, size, maxResultSize - result.length)
                    .then(function(res) {
                      resolve(result.concat(res));
                    })
                    .catch(function(err) {
                      reject(err);
                    });
                }, 1000);
              }
              else {
                resolve(result);
              }
            })
            .catch(function(err){
              if (err && err.ucode === BMA.errorCodes.HTTP_LIMITATION) {
                resolve(result);
              }
              else {
                reject(err);
              }
            });
        });
      },

      getPending = function(offset, size) {
        offset = offset || 0;
        size = size || 20;
        return $q.all([
          BMA.wot.member.uids(),
          BMA.wot.member.pending()
            .then(function(res) {
              return (res.memberships && res.memberships.length) ? res.memberships : undefined;
            })
          ])
          .then(function(res) {
            var uids = res[0];
            var memberships = res[1];
            if (!memberships) return;

            var idtiesByBlock = {};
            var idtiesByPubkey = {};
            _.forEach(memberships, function(ms){
              if (ms.membership == 'IN' && !uids[ms.pubkey]) {
                var idty = {
                  uid: ms.uid,
                  pubkey: ms.pubkey,
                  block: ms.blockNumber,
                  blockHash: ms.blockHash
                };
                var otherIdtySamePubkey = idtiesByPubkey[ms.pubkey];
                if (otherIdtySamePubkey && idty.block > otherIdtySamePubkey.block) {
                  return; // skip
                }
                idtiesByPubkey[idty.pubkey] = idty;
                if (!idtiesByBlock[idty.block]) {
                  idtiesByBlock[idty.block] = [idty];
                }
                else {
                  idtiesByBlock[idty.block].push(idty);
                }

                // Remove previous idty from map
                if (otherIdtySamePubkey) {
                  idtiesByBlock[otherIdtySamePubkey.block] = idtiesByBlock[otherIdtySamePubkey.block].reduce(function(res, aidty){
                    if (aidty.pubkey == otherIdtySamePubkey.pubkey) return res; // if match idty to remove, to NOT add
                    return (res||[]).concat(aidty);
                  }, null);
                  if (idtiesByBlock[otherIdtySamePubkey.block] === null) {
                    delete idtiesByBlock[otherIdtySamePubkey.block];
                  }
                }
              }
            });
            var idties = _sortAndSliceIdentities(_.values(idtiesByPubkey), offset, size);
            var blocks = idties.reduce(function(res, aidty) {
              return res.concat(aidty.block);
            }, []);

            return  $q.all([
              // Get time from blocks
              BMA.blockchain.blocks(_.uniq(blocks))
              .then(function(blocks) {

                _.forEach(blocks, function(block){
                  _.forEach(idtiesByBlock[block.number], function(idty) {
                    idty.sigDate = block.medianTime;
                    if (block.number !== 0 && idty.blockHash !== block.hash) {
                      addEvent(idty, {type:'error', message: 'ERROR.WOT_PENDING_INVALID_BLOCK_HASH'});
                      console.debug("Invalid membership for uid={0}: block hash changed".format(idty.uid));
                    }
                  });
                });
              }),

              // Extension point
              extendAll(idties, 'pubkey', true/*skipAddUid*/)
            ])
            .then(function() {
              return idties;
            });
          });
      },

      getAll = function() {
        var letters = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','u','v','w','x','y','z'];
        return getAllRecursive(letters, 0, BMA.constants.LIMIT_REQUEST_COUNT)
          .then(function(idties) {
            return extendAll(idties, 'pubkey', true/*skipAddUid*/)
              .then(function() {
                return _addUniqueIds(idties);
              });
          });
      },

      getAllRecursive = function(letters, offset, size) {
        return $q(function(resolve, reject) {
          var result = [];
          var pubkeys = {};
          var jobs = [];
          _.each(letters.slice(offset, offset+size), function(letter) {
            jobs.push(
              search(letter, {
                addUniqueId: false, // will be done in parent method
                allowExtension: false // extension point will be called in parent method
              })
            .then(function(idties){
                if (!idties || !idties.length) return;
                result = idties.reduce(function(res, idty) {
                  if (!pubkeys[idty.pubkey]) {
                    pubkeys[idty.pubkey] = true;
                    return res.concat(idty);
                  }
                  return res;
                }, result);
              })
            );
          });

          $q.all(jobs)
            .then(function() {
              if (offset < letters.length - 1) {
                $timeout(function() {
                  getAllRecursive(letters, offset+size, size)
                    .then(function(idties) {
                      if (!idties || !idties.length) {
                        resolve(result);
                        return;
                      }
                      resolve(idties.reduce(function(res, idty) {
                        if (!pubkeys[idty.pubkey]) {
                          pubkeys[idty.pubkey] = true;
                          return res.concat(idty);
                        }
                        return res;
                      }, result));
                    })
                    .catch(function(err) {
                      reject(err);
                    });
                }, BMA.constants.LIMIT_REQUEST_DELAY);
              }
              else {
                resolve(result);
              }
            })
            .catch(function(err){
              if (err && err.ucode === BMA.errorCodes.HTTP_LIMITATION) {
                resolve(result);
              }
              else {
                reject(err);
              }
            });
        });
      },

      extend = function(idty, pubkeyAttributeName, skipAddUid) {
        return extendAll([idty], pubkeyAttributeName, skipAddUid)
          .then(function(res) {
            return res[0];
          });
      },

      extendAll = function(idties, pubkeyAttributeName, skipAddUid) {

        pubkeyAttributeName = pubkeyAttributeName || 'pubkey';

        var jobs = [];
        if (!skipAddUid) jobs.push(BMA.wot.member.uids());

        jobs.push(api.data.raisePromise.search(null, idties, pubkeyAttributeName)
          .catch(function(err) {
            console.debug('Error while search identities, on extension point.');
            console.error(err);
          }));

        return $q.all(jobs)
        .then(function(res) {
          if (!skipAddUid) {
            var uidsByPubkey = res[0];
            // Set uid (on every data)
            _.forEach(idties, function(data) {
              if (!data.uid && data[pubkeyAttributeName]) {
                data.uid = uidsByPubkey[data[pubkeyAttributeName]];
                // Remove name if redundant with uid
                if (data.uid && data.uid == data.name) {
                  delete data.name;
                }
              }
            });
          }

          return idties;
        });
      },

      addEvent = function(data, event) {
        event = event || {};
        event.type = event.type || 'info';
        event.message = event.message || '';
        event.messageParams = event.messageParams || {};
        data.events = data.events || [];
        data.events.push(event);
      }
    ;

    // Register extension points
    api.registerEvent('data', 'load');
    api.registerEvent('data', 'search');
    api.registerEvent('data', 'loadRequirements');

    return {
      id: id,
      load: loadData,
      search: search,
      newcomers: getNewcomers,
      pending: getPending,
      all: getAll,
      extend: extend,
      extendAll: extendAll,
      // api extension
      api: api
    };
  }

  var service = factory('default', BMA);

  service.instance = factory;
  return service;
});
