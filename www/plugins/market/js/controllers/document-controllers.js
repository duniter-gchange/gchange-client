angular.module('cesium.market.document.controllers', ['cesium.es.services'])

  .controller('MkLastDocumentsCtrl', MkLastDocumentsController)
;


function MkLastDocumentsController($scope, $controller, $timeout, $state, $filter) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESLastDocumentsCtrl', {$scope: $scope}));

  $scope.search.index = 'user,page,group,market';
  $scope.search.type = 'profile,record,comment';
  $scope._source = ["issuer", "hash", "time", "creationTime", "title", "price", "unit", "currency", "picturesCount", "thumbnail._content_type", "city", "message", "record"];

  $scope.inheritedSelectDocument = $scope.selectDocument;
  $scope.selectDocument = function(event, doc) {
    // Call super function
    if (doc.index !== "market") {
      $scope.inheritedSelectDocument(event, doc);
      return;
    }

    // Manage click on a market document
    if (!doc || !event || event.defaultPrevented) return;
    event.stopPropagation();

    if (doc.index === "market" && doc.type === "record") {
      $state.go('app.market_view_record', {id: doc.id, title: doc.title});
    }
    else if (doc.index === "market" && doc.type === "comment") {
      var anchor = $filter('formatHash')(doc.id);
      $state.go('app.market_view_record_anchor', {id: doc.record, anchor: anchor});
    }
  };
}
