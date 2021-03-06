/// <reference path="../../typings/index.d.ts" />

export default routesConfig;

/** @ngInject */
function routesConfig(
    $stateProvider: angular.ui.IStateProvider,
    $urlRouterProvider: angular.ui.IUrlRouterProvider,
    $locationProvider: angular.ILocationProvider
) {
    $locationProvider.html5Mode(true).hashPrefix('!');
    $urlRouterProvider.otherwise('/authors');

    $stateProvider
    .state('authors', {
        url: '/authors',
        template: '<authors></authors>'
    })
    .state('author', {
        url: '/authors/author/:authorId',
        template: '<author></author>'
    })
    .state('books', {
        url: '/books/:filter',
        template: '<books></books>'
    })
    .state('book', {
        url: '/books/book/:bookId',
        template: '<book></book>'
    });
}
