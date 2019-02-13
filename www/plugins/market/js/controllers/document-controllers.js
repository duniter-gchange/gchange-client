angular.module('cesium.market.document.controllers', ['cesium.es.services'])

  .controller('MkLastDocumentsCtrl', MkLastDocumentsController)
;


function MkLastDocumentsController($scope, $controller, $timeout, $state, $filter) {
  'ngInject';

  $scope.search = {
    loading: true,
    hasMore: true,
    text: undefined,
    index: 'user,page,group,market', type: 'profile,record,comment',
    //index: 'user', type: 'profile',
    //index: 'market', type: 'record',
    //index: 'market', type: 'comment',
    results: undefined,
    sort: 'time',
    asc: false
  };
  $scope.expertMode = false;
  $scope.defaultSizeLimit = 20;
  $scope._source = ["issuer", "hash", "time", "creationTime", "title", "price", "unit", "currency", "picturesCount", "thumbnail._content_type", "city", "message", "record"];

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESDocumentLookupCtrl', {$scope: $scope}));
  $scope.$on('$ionicParentView.enter', $scope.enter);

  $scope.selectDocument = function(event, doc) {
    if (!doc || !event || event.defaultPrevented) return;
    event.stopPropagation();

    if (doc.index=="user" && doc.type=="profile") {
      $state.go('app.wot_identity', {pubkey: doc.pubkey, uid: doc.name});
    }
    else if (doc.index=="market" && doc.type=="record") {
      $state.go('app.market_view_record', {id: doc.id, title: doc.title});
    }
    else if (doc.index=="market" && doc.type=="comment") {
      var anchor = $filter('formatHash')(doc.id);
      $state.go('app.market_view_record_anchor', {id: doc.record, anchor: anchor});
    }
    else if (doc.index=="page" && doc.type=="record") {
      // TODO
    }
    else if (doc.index=="group" && doc.type=="record") {
      // TODO
    }
  };

  // Override parent function computeOptions
  var inheritedComputeOptions = $scope.computeOptions;
  $scope.computeOptions = function(offset, size){
    // Cal inherited function
    var options = inheritedComputeOptions(offset, size);

    if (!options.sort || options.sort.time) {
      var side = options.sort && options.sort.time || side;
      options.sort = [
        //{'creationTime': side},
        {'time': side}
      ];
    }

    options._source = options._source || $scope._source;
    options.getTimeFunction = function(doc) {
      doc.time = doc.creationTime || doc.time;
      return doc.time;
    };
    return options;
  };

  // Listen for changes
  $timeout(function() {
    $scope.startListenChanges();
  }, 1000);
}