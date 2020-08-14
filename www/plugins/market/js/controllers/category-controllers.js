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
    },
    showClosed: false
  }, csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.record || {});

  $scope.load = function(options) {

    $scope.loading = true;

    options = options || {};
    options.filter = options.filter || ($scope.options && $scope.options.category && $scope.options.category.filter);
    options.withStock = (!$scope.options || !$scope.options.showClosed);

    return mkRecord.category.stats(options)
      .then(function(res) {
        $scope.categories = res;
        $scope.totalCount = $scope.categories.reduce(function(res, cat) {
         return res + cat.count;
        }, 0);
        $scope.loading = false;
        if ($scope.motion.show) $scope.motion.show();
      });
  };

  $scope.refresh = function() {
    if ($scope.loading) return;
    // Load data
    return $scope.load();
  };

  $scope.$watch('options.showClosed', $scope.refresh, true);

}

function MkViewCategoriesController($scope, $controller, $state) {
    'ngInject';

    // Initialize the super class and extend it.
    angular.extend(this, $controller('MkListCategoriesCtrl', {$scope: $scope}));

    // When view enter: load data
    $scope.enter = function(e, state) {

        // Load data
        return $scope.load()
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
        return $state.go('app.market_lookup', {category: cat && cat.id});
    };
}
