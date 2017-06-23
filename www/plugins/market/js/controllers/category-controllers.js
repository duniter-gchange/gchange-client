angular.module('cesium.market.category.controllers', ['cesium.market.record.services', 'cesium.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

    .state('app.market_categories', {
      url: "/market/categories",
      views: {
        'menuContent': {
          templateUrl: "plugins/market/templates/category/view_categories.html",
          controller: 'MkViewCategoriesCtrl'
        }
      },
      data: {
        large: 'app.market_categories_lg'
      }
    })

    .state('app.market_categories_lg', {
      url: "/market/categories/lg",
      views: {
        'menuContent': {
          templateUrl: "plugins/market/templates/category/view_categories_lg.html",
          controller: 'MkViewCategoriesCtrl'
        }
      }
    })
;
  })

 .controller('MkListCategoriesCtrl', MkListCategoriesController)

 .controller('MkViewCategoriesCtrl', MkViewCategoriesController)

;

function MkListCategoriesController($scope, UIUtils, csConfig, mkRecord) {
  'ngInject';

  $scope.loading = true;
  $scope.motion = UIUtils.motion.ripple;

  // Screen options
  $scope.options = $scope.options || angular.merge({
    category: {
      filter: undefined
    }
  }, csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.record || {});


  $scope.load = function() {

    var options = {
      filter: $scope.options && $scope.options.category && $scope.options.category.filter
    };

    return mkRecord.category.stats(options)
      .then(function(res) {
        $scope.categories = res;
        $scope.loading = false;
      });
  };

  $scope.refresh = function() {
    $scope.loading = true;
    // Load data
    $scope.load()
      .then(function() {
        $scope.loading = false;
        $scope.motion.show();
        $scope.entered = true;
      });
  };

}

function MkViewCategoriesController($scope, $controller, $state) {
    'ngInject';

    // Initialize the super class and extend it.
    angular.extend(this, $controller('MkListCategoriesController', {$scope: $scope}));

    // When view enter: load data
    $scope.enter = function(e, state) {
        // Read stateParams if need

        // Load data
        $scope.load()
            .then(function() {
                $scope.loading = false;
                if (!$scope.entered) {
                    $scope.motion.show();
                }
                $scope.entered = true;
            });
    };
    $scope.$on('$ionicView.enter',$scope.enter);

    $scope.onCategoryClick = function(cat) {
        return $state.go('app.market_lookup', {category: cat.id});
    }
}
