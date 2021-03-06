/// <reference path="./index.d.ts" />

// import * as Jsonapi from './core';
import { Core } from './core';
import { Base } from './services/base';
import { PathMaker } from './services/path-maker';
import { Converter } from './services/resource-converter';
import { Filter } from './services/filter';
import { MemoryCache } from './services/memorycache';

import { ISchema, IResource, ICollection, ICache } from './interfaces';

export class Resource implements IResource {
    public schema: ISchema;
    protected path: string;   // without slashes

    public is_new = true;
    public is_loading = false;
    public type: string;
    public id: string;
    public attributes: any ;
    public relationships: any = {}; // [];

    public memorycache: ICache;
    public cache_vars: Object = {};


    /*
    just for fix _delete becouse we duplicate collection before
    return on _all()
    this need to go out on the future
    with this prevent do delete resource on user app next to success
    */
    private tempororay_collection: ICollection;

    public clone(): any {
        var cloneObj = new (<any>this.constructor)();
        for (var attribut in this) {
            if (typeof this[attribut] !== 'object') {
                cloneObj[attribut] = this[attribut];
            }
        }
        return cloneObj;
    }

    /**
    Register schema on Core
    @return true if the resource don't exist and registered ok
    **/
    public register(): boolean {
        if (Core.Me === null) {
            throw 'Error: you are trying register --> ' + this.type + ' <-- before inject JsonapiCore somewhere, almost one time.';
        }
        // only when service is registered, not cloned object
        this.memorycache = new MemoryCache();
        return Core.Me._register(this);
    }

    public getPrePath(): string {
        return '';
    }
    public getPath(): string {
        return this.path ? this.path : this.type;
    }

    // empty self object
    public new<T extends IResource>(): T {
        let resource = this.clone();
        resource.reset();
        return resource;
    }

    public reset(): void {
        let self = this;
        this.id = '';
        this.attributes = {};
        angular.forEach(this.schema.attributes, (value, key) => {
            self.attributes[key] = value.default ? value.default : undefined;
        });
        this.relationships = {};
        angular.forEach(this.schema.relationships, (value, key) => {
            self.relationships[key] = {};
            self.relationships[key]['data'] = this.schema.relationships[key].hasMany ? Base.newCollection() : {};
        });
        this.is_new = true;
    }

    public toObject(params?: IParams): IDataObject {
        params = angular.extend({}, Base.Params, params);
        this.schema = angular.extend({}, Base.Schema, this.schema);

        let relationships = { };
        let included = [ ];
        let included_ids = [ ]; // just for control don't repeat any resource

        // REALTIONSHIPS
        angular.forEach(this.relationships, (relationship, relation_alias) => {

            if (this.schema.relationships[relation_alias] && this.schema.relationships[relation_alias].hasMany) {
                // has many (hasMany:true)
                relationships[relation_alias] = { data: [] };

                angular.forEach(relationship.data, (resource: IResource) => {
                    let reational_object = { id: resource.id, type: resource.type };
                    relationships[relation_alias]['data'].push(reational_object);

                    // no se agregó aún a included && se ha pedido incluir con el parms.include
                    let temporal_id = resource.type + '_' + resource.id;
                    if (included_ids.indexOf(temporal_id) === -1 && params.include.indexOf(relation_alias) !== -1) {
                        included_ids.push(temporal_id);
                        included.push(resource.toObject({ }).data);
                    }
                });
            } else {
                // has one (hasMany:false)
                if (!('id' in relationship.data) && !angular.equals({}, relationship.data)) {
                    console.warn(relation_alias + ' defined with hasMany:false, but I have a collection');
                }

                if (relationship.data.id && relationship.data.type) {
                    relationships[relation_alias] = { data: { id: relationship.data.id, type: relationship.data.type } };
                } else {
                    relationships[relation_alias] = { data: { } };
                }

                // no se agregó aún a included && se ha pedido incluir con el parms.include
                let temporal_id = relationship.data.type + '_' + relationship.data.id;
                if (included_ids.indexOf(temporal_id) === -1 && params.include.indexOf(relationship.data.type) !== -1) {
                    included_ids.push(temporal_id);
                    included.push(relationship.data.toObject({ }).data);
                }
            }
        });

        let ret: IDataObject = {
            data: {
                type: this.type,
                id: this.id,
                attributes: this.attributes,
                relationships: relationships
            }
        };

        if (included.length > 0) {
            ret.included = included;
        }

        return ret;
    }

    public get<T extends IResource>(id: string, params?: Object | Function, fc_success?: Function, fc_error?: Function): T {
        return this.__exec(id, params, fc_success, fc_error, 'get');
    }

    public delete(id: string, params?: Object | Function, fc_success?: Function, fc_error?: Function): void {
        this.__exec(id, params, fc_success, fc_error, 'delete');
    }

    public all(params?: Object | Function, fc_success?: Function, fc_error?: Function): ICollection {
    // public all<T extends IResource>(params?: Object | Function, fc_success?: Function, fc_error?: Function): Array<T> {
        return this.__exec(null, params, fc_success, fc_error, 'all');
    }

    public save<T extends IResource>(params?: Object | Function, fc_success?: Function, fc_error?: Function): Array<T> {
        return this.__exec(null, params, fc_success, fc_error, 'save');
    }

    /**
    This method sort params for new(), get() and update()
    */
    private __exec(id: string, params: IParams, fc_success, fc_error, exec_type: string): any {
        // makes `params` optional
        if (angular.isFunction(params)) {
            fc_error = fc_success;
            fc_success = params;
            params = angular.extend({}, Base.Params);
        } else {
            if (angular.isUndefined(params)) {
                params = angular.extend({}, Base.Params);
            } else {
                params = angular.extend({}, Base.Params, params);
            }
        }

        fc_success = angular.isFunction(fc_success) ? fc_success : angular.noop();
        fc_error = angular.isFunction(fc_error) ? fc_error : undefined;

        this.schema = angular.extend({}, Base.Schema, this.schema);

        switch (exec_type) {
            case 'get':
            return this._get(id, params, fc_success, fc_error);
            case 'delete':
            return this._delete(id, params, fc_success, fc_error);
            case 'all':
            return this._all(params, fc_success, fc_error);
            case 'save':
            return this._save(params, fc_success, fc_error);
        }
    }

    private runFc(some_fc, param) {
        return angular.isFunction(some_fc) ? some_fc(param) : angular.noop();
    }

    public _get(id: string, params, fc_success, fc_error): IResource {
        // http request
        let path = new PathMaker();
        path.appendPath(this.getPrePath());
        path.appendPath(this.getPath());
        path.appendPath(id);
        params.include ? path.setInclude(params.include) : null;

        let resource = id in this.getService().memorycache.resources ? this.getService().memorycache.resources[id] : this.new();
        resource.is_loading = true;

        Core.Services.JsonapiHttp
        .get(path.get())
        .then(
            success => {
                Converter.build(success.data, resource, this.schema);
                resource.is_loading = false;
                this.fillCacheResource(resource);
                this.runFc(fc_success, success);
            },
            error => {
                this.runFc(fc_error, error);
            }
        );

        return resource;
    }

    public _all(params: IParams, fc_success, fc_error): ICollection {

        // http request
        let path = new PathMaker();
        path.appendPath(this.getPrePath());
        params.beforepath ? path.appendPath(params.beforepath) : null;
        path.appendPath(this.getPath());
        params.include ? path.setInclude(params.include) : null;

        // make request
        this.tempororay_collection = Base.newCollection();

        // MEMORY_CACHE
        if (this.getService().memorycache.isCollectionExist(path.getForCache())) {
            this.tempororay_collection.$source = 'memorycache';

            // fill collection and filter
            let filter = new Filter();
            angular.forEach(this.getService().memorycache.getCollection(path.getForCache()), (value, key) => {
                if (!params.filter || Object.keys(params.filter).length === 0 || filter.passFilter(value, params.filter)) {
                    this.tempororay_collection[key] = value;
                }
            });

            // exit if ttl is not expired
            if (this.getService().memorycache.isCollectionLive(path.getForCache(), this.schema.ttl)) {
                this.runFc(fc_success, 'memorycache');
                return this.tempororay_collection;
            }
        }

        // SERVER REQUEST
        this.tempororay_collection['$isloading'] = true;
        Core.Services.JsonapiHttp
        .get(path.get())
        .then(
            success => {
                this.tempororay_collection.$source = 'server';
                this.tempororay_collection.$isloading = false;
                Converter.build(success.data, this.tempororay_collection, this.schema);

                this.getService().memorycache.setCollection(path.getForCache(), this.tempororay_collection);

                // filter getted data
                if (params.filter && Object.keys(params.filter).length) {
                    let filter = new Filter();
                    angular.forEach(this.tempororay_collection, (value, key) => {
                        if (!filter.passFilter(value, params.filter)) {
                            delete this.tempororay_collection[key];
                        }
                    });
                }

                this.runFc(fc_success, success);
            },
            error => {
                this.tempororay_collection.$source = 'server';
                this.tempororay_collection.$isloading = false;
                this.runFc(fc_error, error);
            }
        );
        return this.tempororay_collection;
    }

    public _delete(id: string, params, fc_success, fc_error): void {
        // http request
        let path = new PathMaker();
        path.appendPath(this.getPrePath());
        path.appendPath(this.getPath());
        path.appendPath(id);

        Core.Services.JsonapiHttp
        .delete(path.get())
        .then(
            success => {
                delete this.tempororay_collection[id];
                this.getService().memorycache.removeResource(id);
                this.runFc(fc_success, success);
            },
            error => {
                this.runFc(fc_error, error);
            }
        );
    }

    public _save(params: IParams, fc_success: Function, fc_error: Function): IResource {
        let object = this.toObject(params);

        // http request
        let path = new PathMaker();
        path.appendPath(this.getPrePath());
        path.appendPath(this.getPath());
        this.id && path.appendPath(this.id);
        params.include ? path.setInclude(params.include) : null;

        let resource = this.new();

        let promise = Core.Services.JsonapiHttp.exec(
            path.get(), this.id ? 'PUT' : 'POST',
            object, !(angular.isFunction(fc_error))
        );

        promise.then(
            success => {
                let value = success.data.data;
                this.attributes = value.attributes;
                this.id = value.id;

                // foce reload cache
                this.getService().memorycache.clearAllCollections();

                this.runFc(fc_success, success);
            },
            error => {
                this.runFc(fc_error, 'data' in error ? error.data : error);
            }
        );

        return resource;
    }

    public addRelationship<T extends IResource>(resource: T, type_alias?: string) {
        let object_key = resource.id;
        if (!object_key) {
            object_key = 'new_' + (Math.floor(Math.random() * 100000));
        }

        type_alias = (type_alias ? type_alias : resource.type);
        if (!(type_alias in this.relationships)) {
            this.relationships[type_alias] = { data: { } };
        }

        if (this.schema.relationships[type_alias].hasMany) {
            this.relationships[type_alias]['data'][object_key] = resource;
        } else {
            this.relationships[type_alias]['data'] = resource;
        }
    }

    public addRelationships<T extends IResource>(resources: Array<T>, type_alias: string) {
        if (!(type_alias in this.relationships)) {
            this.relationships[type_alias] = { data: { } };
        }

        if (!this.schema.relationships[type_alias].hasMany) {
            console.warn('addRelationships not supported on ' + this.type + ' schema.');
        }

        angular.forEach(resources, (resource) => {
            this.relationships[type_alias]['data'][resource.id] = resource;
        });
    }

    public removeRelationship(type_alias: string, id: string): boolean {
        if (!(type_alias in this.relationships)) {
            return false;
        }
        if (!('data' in this.relationships[type_alias])) {
            return false;
        }
        if (!(id in this.relationships[type_alias]['data'])) {
            return false;
        }
        delete this.relationships[type_alias]['data'][id];
        return true;
    }

    private fillCacheResource<T extends IResource>(resource: T) {
        this.getService().memorycache.resources[resource.id] = resource;
    }

    /**
    @return This resource like a service
    **/
    public getService() {
        return Converter.getService(this.type);
    }
}
