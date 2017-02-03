'use strict';


function createMap() {
  return Object.create(null);
}
var isArray = angular.isArray;
var isObject = angular.isObject;
var isUndefined = angular.isUndefined;
var forEach = angular.forEach;


var app = angular.module('ngClassBenchmark', []);


function BenchmarkController($scope) {
  $scope.benchmark = this;

  this.numberOfTodos = 1000;
  this.templates = [{name: '- none -', template: ''}];
  this.selectedTemplate = this.templates[0];
  this.bindTemplate = this.templates[0];
  this.implementations = [
    {impl:'ng-class', label:'ng-class (current implementation)'},
    {impl:'ng-class-comp', label:'ng-class-comp (use compile function)'},
    {impl:'ng-class-link', label:'ng-class-link (use link function)'},
    {impl:'ng-class-nop', label:'ng-class-nop (substract cost, no ngClass executed)'},
  ];
  this.selectedImplementation = this.implementations[0];
  this.bindImplementation = this.implementations[0];

  this.todos = new Todos();

  this.addTemplate = function(name, template) {
    this.templates.push({name:name, template:template});

    if (this.templates.length === 2) {
      this.selectedTemplate = this.templates[1];
      this.bindTemplate = this.templates[1];
    }
  }.bind(this);

  this.updateBind = function() {
    this.todos = new Todos();
    this.bindTemplate = this.selectedTemplate;
    this.bindImplementation = this.selectedImplementation;
  }.bind(this);

  this.stepClear = function() {
    this.todos = null;
    this.bindTemplate = this.templates[0];
    $scope.$apply();
  }.bind(this);

  this.stepBuild = function(implementation) {
    this.todos = new Todos(this.numberOfTodos);
    this.bindTemplate = this.selectedTemplate;
    this.bindImplementation = implementation || this.selectedImplementation;
    $scope.$apply();
  }.bind(this);

  benchmarkSteps.push({
    name: 'setup',
    fn: this.stepClear
  });

  benchmarkSteps.push({
    name: 'build',
    fn: this.stepBuild
  });

  benchmarkSteps.push({
    name: 'apply',
    fn: function() {
      $scope.$apply();
    }.bind(this),
  });

  benchmarkSteps.push({
    name: 'update',
    fn: function() {
      this.todos.setValuesWithSeed(89);
      $scope.$apply();
    }.bind(this),
  });

  benchmarkSteps.push({
    name: 'down',
    fn: this.stepClear
  });
}

function Todos(count) {
  this.completedPeriodicity = 3;
  this.importantPeriodicity = 13;
  this.urgentPeriodicity = 29;

  this.setValuesWithSeed = function(offset) {
    var i, todo;
    for (i = 0; i < this.list.length; i++) {
      todo = this.list[i];
      todo.completed = 0 === (i + offset) % this.completedPeriodicity;
      todo.important = 0 === (i + offset) % this.importantPeriodicity;
      todo.urgent = 0 === (i + offset) % this.urgentPeriodicity;
    }
  };

  function createTodos(count) {
    var i;
    this.list = [];
    for (i = 0; i < count; i++) {
      this.list.push({
        id: i + 1,
        completed: false,
        important: false,
        urgent: false
      });
    }
  }

  createTodos.call(this, count || 29 * 2 + 12 + 2);
  this.setValuesWithSeed(5);
}

app.directive('benchmark', function() {
  return {
    controller: BenchmarkController,
  };
})

app.directive('script', function() {
  return {
    require: '?^^benchmark',
    link: function(scope, element, attrs, benchmark) {
      if (attrs.type === 'text/bechmark-template') {
        benchmark.addTemplate(attrs.name, element.html());
      }
    }
  }
});

app.directive('benchmarkBind', function($compile) {
  return {
    require: '^^benchmark',
    link: function(scope, element, attrs, benchmark) {
      var childScope;
      scope.$watch(function() {
        return benchmark.bindTemplate.name + '#' + benchmark.bindImplementation.impl;
      }, function() {
        if (childScope) {
          childScope.$destroy();
          element.empty();
        }

        var template = benchmark.bindTemplate.template.replace(
          /\{%=\s*implementation\s*%\}/ig, benchmark.bindImplementation.impl);

        childScope = scope.$new();
        element.html('<div>'+template+'</div>');
        $compile(element.children())(childScope);
      });
    }
  }
});


app.directive('ngClassLink', ['$parse', function($parse) {
    var name = 'ngClassLink';
    var selector = true;
    var indexWatchExpression;

    return {
      restrict: 'AC',
      link: function(scope, element, attr) {
        var expression = attr[name].trim();
        var isOneTime = (expression.charAt(0) === ':') && (expression.charAt(1) === ':');

        var watchInterceptor = isOneTime ? toFlatValue : toClassString;
        var watchExpression = $parse(expression, watchInterceptor);
        var watchAction = isOneTime ? ngClassOneTimeWatchAction : ngClassWatchAction;

        var classCounts = element.data('$classCounts');
        var oldModulo = true;
        var oldClassString;

        if (!classCounts) {
          // Use createMap() to prevent class assumptions involving property
          // names in Object.prototype
          classCounts = createMap();
          element.data('$classCounts', classCounts);
        }

        if (name !== 'ngClassLink') {
          if (!indexWatchExpression) {
            indexWatchExpression = $parse('$index', function moduloTwo($index) {
              // eslint-disable-next-line no-bitwise
              return $index & 1;
            });
          }

          scope.$watch(indexWatchExpression, ngClassIndexWatchAction);
        }

        scope.$watch(watchExpression, watchAction, isOneTime);

        function addClasses(classString) {
          classString = digestClassCounts(split(classString), 1);
          attr.$addClass(classString);
        }

        function removeClasses(classString) {
          classString = digestClassCounts(split(classString), -1);
          attr.$removeClass(classString);
        }

        function updateClasses(oldClassString, newClassString) {
          var oldClassArray = split(oldClassString);
          var newClassArray = split(newClassString);

          var toRemoveArray = arrayDifference(oldClassArray, newClassArray);
          var toAddArray = arrayDifference(newClassArray, oldClassArray);

          var toRemoveString = digestClassCounts(toRemoveArray, -1);
          var toAddString = digestClassCounts(toAddArray, 1);

          attr.$addClass(toAddString);
          attr.$removeClass(toRemoveString);
        }

        function digestClassCounts(classArray, count) {
          var classesToUpdate = [];

          forEach(classArray, function(className) {
            if (count > 0 || classCounts[className]) {
              classCounts[className] = (classCounts[className] || 0) + count;
              if (classCounts[className] === +(count > 0)) {
                classesToUpdate.push(className);
              }
            }
          });

          return classesToUpdate.join(' ');
        }

        function ngClassIndexWatchAction(newModulo) {
          // This watch-action should run before the `ngClass[OneTime]WatchAction()`, thus it
          // adds/removes `oldClassString`. If the `ngClass` expression has changed as well, the
          // `ngClass[OneTime]WatchAction()` will update the classes.
          if (newModulo === selector) {
            addClasses(oldClassString);
          } else {
            removeClasses(oldClassString);
          }

          oldModulo = newModulo;
        }

        function ngClassOneTimeWatchAction(newClassValue) {
          var newClassString = toClassString(newClassValue);

          if (newClassString !== oldClassString) {
            ngClassWatchAction(newClassString);
          }
        }

        function ngClassWatchAction(newClassString) {
          if (oldModulo === selector) {
            updateClasses(oldClassString, newClassString);
          }

          oldClassString = newClassString;
        }
      }
    };
}]);

app.directive('ngClassComp', ['$parse', function($parse) {
    var name = 'ngClassComp';
    var selector = true;
    var indexWatchExpression;

    return {
      restrict: 'AC',
      compile: function(tElement, tAttr) {
        var expression = tAttr[name].trim();
        var isOneTime = (expression.charAt(0) === ':') && (expression.charAt(1) === ':');

        var watchInterceptor = isOneTime ? toFlatValue : toClassString;
        var watchExpression = $parse(expression, watchInterceptor);

        if (name !== 'ngClassComp') {
          if (!indexWatchExpression) {
            indexWatchExpression = $parse('$index', function moduloTwo($index) {
              // eslint-disable-next-line no-bitwise
              return $index & 1;
            });
          }
        }

        return function(scope, element, attr) {

          var watchAction = isOneTime ? ngClassOneTimeWatchAction : ngClassWatchAction;

          var classCounts = element.data('$classCounts');
          var oldModulo = true;
          var oldClassString;

          if (!classCounts) {
            // Use createMap() to prevent class assumptions involving property
            // names in Object.prototype
            classCounts = createMap();
            element.data('$classCounts', classCounts);
          }

          if (name !== 'ngClassComp') {
            scope.$watch(indexWatchExpression, ngClassIndexWatchAction);
          }

          scope.$watch(watchExpression, watchAction, isOneTime);

          function addClasses(classString) {
            classString = digestClassCounts(split(classString), 1);
            attr.$addClass(classString);
          }

          function removeClasses(classString) {
            classString = digestClassCounts(split(classString), -1);
            attr.$removeClass(classString);
          }

          function updateClasses(oldClassString, newClassString) {
            var oldClassArray = split(oldClassString);
            var newClassArray = split(newClassString);

            var toRemoveArray = arrayDifference(oldClassArray, newClassArray);
            var toAddArray = arrayDifference(newClassArray, oldClassArray);

            var toRemoveString = digestClassCounts(toRemoveArray, -1);
            var toAddString = digestClassCounts(toAddArray, 1);

            attr.$addClass(toAddString);
            attr.$removeClass(toRemoveString);
          }

          function digestClassCounts(classArray, count) {
            var classesToUpdate = [];

            forEach(classArray, function(className) {
              if (count > 0 || classCounts[className]) {
                classCounts[className] = (classCounts[className] || 0) + count;
                if (classCounts[className] === +(count > 0)) {
                  classesToUpdate.push(className);
                }
              }
            });

            return classesToUpdate.join(' ');
          }

          function ngClassIndexWatchAction(newModulo) {
            // This watch-action should run before the `ngClass[OneTime]WatchAction()`, thus it
            // adds/removes `oldClassString`. If the `ngClass` expression has changed as well, the
            // `ngClass[OneTime]WatchAction()` will update the classes.
            if (newModulo === selector) {
              addClasses(oldClassString);
            } else {
              removeClasses(oldClassString);
            }

            oldModulo = newModulo;
          }

          function ngClassOneTimeWatchAction(newClassValue) {
            var newClassString = toClassString(newClassValue);

            if (newClassString !== oldClassString) {
              ngClassWatchAction(newClassString);
            }
          }

          function ngClassWatchAction(newClassString) {
            if (oldModulo === selector) {
              updateClasses(oldClassString, newClassString);
            }

            oldClassString = newClassString;
          }
        };
      }
    };
}]);

// Helpers
function arrayDifference(tokens1, tokens2) {
  if (!tokens1 || !tokens1.length) return [];
  if (!tokens2 || !tokens2.length) return tokens1;

  var values = [];

  outer:
  for (var i = 0; i < tokens1.length; i++) {
    var token = tokens1[i];
    for (var j = 0; j < tokens2.length; j++) {
      if (token === tokens2[j]) continue outer;
    }
    values.push(token);
  }

  return values;
}

function split(classString) {
  return classString && classString.split(' ');
}

function toClassString(classValue) {
  var classString = classValue;

  if (isArray(classValue)) {
    classString = classValue.map(toClassString).join(' ');
  } else if (isObject(classValue)) {
    classString = Object.keys(classValue).
      filter(function(key) { return classValue[key]; }).
      join(' ');
  }

  return classString;
}

function toFlatValue(classValue) {
  var flatValue = classValue;

  if (isArray(classValue)) {
    flatValue = classValue.map(toFlatValue);
  } else if (isObject(classValue)) {
    var hasUndefined = false;

    flatValue = Object.keys(classValue).filter(function(key) {
      var value = classValue[key];

      if (!hasUndefined && isUndefined(value)) {
        hasUndefined = true;
      }

      return value;
    });

    if (hasUndefined) {
      // Prevent the `oneTimeLiteralWatchInterceptor` from unregistering
      // the watcher, by including at least one `undefined` value.
      flatValue.push(undefined);
    }
  }

  return flatValue;
}
