module Jsonapi {
    export class Resource implements IResource {
        public schema: ISchema;
        protected path: string = null;   // without slashes
        private params_base: Jsonapi.IParams = {
            id: '',
            include: []
        };
        private schema_base = {
            attributes: {},
            relationships: {}
        };

        public is_new = true;
        public type: string;
        public id: string;
        public attributes: any ;
        public relationships: any = {}; //[];

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
        Register schema on Jsonapi.Core
        @return true if the resource don't exist and registered ok
        **/
        public register(): boolean {
            if (Jsonapi.Core.Me === null) {
                throw 'Error: you are trying register --> ' + this.type + ' <-- before inject JsonapiCore somewhere, almost one time.';
            }
            return Jsonapi.Core.Me._register(this);
        }

        public getPath() {
            return this.path ? this.path : this.type;
        }

        // empty self object
        public new(): IResource {
            let resource = this.clone();
            resource.reset();
            return resource;
        }

        public reset(): void {
            let self = this;
            this.id = '';
            this.attributes = {};
            this.relationships = {};
            angular.forEach(this.schema.relationships, (value, key) => {
                self.relationships[key] = {};
                self.relationships[key]['data'] = {};
            });
            this.is_new = true;
        }

        public toObject(params: Jsonapi.IParams): Jsonapi.IDataObject {
            params = angular.extend({}, this.params_base, params);
            this.schema = angular.extend({}, this.schema_base, this.schema);

            let relationships = { };
            let included = [ ];
            let included_ids = [ ]; //just for control don't repeat any resource

            // agrego cada relationship
            angular.forEach(this.relationships, (relationship, relation_alias) => {

                if (this.schema.relationships[relation_alias] && this.schema.relationships[relation_alias].hasMany) {
                    relationships[relation_alias] = { data: [] };

                    angular.forEach(relationship.data, (resource: Jsonapi.IResource) => {
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
                    if (!('id' in relationship.data)) {
                        console.warn(relation_alias + ' defined with hasMany:false, but I have a collection');
                    }

                    relationships[relation_alias] = { data: { id: relationship.data.id, type: relationship.data.type } };

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

        public get(id: String, params?: Object | Function, fc_success?: Function, fc_error?: Function): IResource {
            return this.__exec(id, params, fc_success, fc_error, 'get');
        }

        public delete(id: String, params?: Object | Function, fc_success?: Function, fc_error?: Function): void {
            this.__exec(id, params, fc_success, fc_error, 'delete');
        }

        public all(params?: Object | Function, fc_success?: Function, fc_error?: Function): Array<IResource> {
            return this.__exec(null, params, fc_success, fc_error, 'all');
        }

        public save(params?: Object | Function, fc_success?: Function, fc_error?: Function): Array<IResource> {
            return this.__exec(null, params, fc_success, fc_error, 'save');
        }

        /**
        This method sort params for new(), get() and update()
        */
        private __exec(id: String, params: Jsonapi.IParams, fc_success, fc_error, exec_type: string): any {
            // makes `params` optional
            if (angular.isFunction(params)) {
                fc_error = fc_success;
                fc_success = params;
                params = this.params_base;
            } else {
                if (angular.isUndefined(params)) {
                    params = this.params_base;
                } else {
                    params = angular.extend({}, this.params_base, params);
                }
            }

            fc_success = angular.isFunction(fc_success) ? fc_success : function () {};
            fc_error = angular.isFunction(fc_error) ? fc_error : function () {};

            this.schema = angular.extend({}, this.schema_base, this.schema);

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

        public _get(id: String, params, fc_success, fc_error): IResource {
            // http request
            let path = new Jsonapi.PathMaker();
            path.addPath(this.getPath());
            path.addPath(id);
            params.include ? path.setInclude(params.include) : null;

            let resource = this.new();

            Jsonapi.Core.Services.JsonapiHttp
            .get(path.get())
            .then(
                success => {
                    Converter.build(success.data, resource, this.schema);
                    fc_success(success);
                },
                error => {
                    fc_error(error);
                }
            );

            return resource;
        }

        public _all(params, fc_success, fc_error): Object { // Array<IResource> {

            // http request
            let path = new Jsonapi.PathMaker();
            path.addPath(this.getPath());
            params.include ? path.setInclude(params.include) : null;

            // make request
            let resource = {};  // if you use [], key like id is not possible
            Jsonapi.Core.Services.JsonapiHttp
            .get(path.get())
            .then(
                success => {
                    Converter.build(success.data, resource, this.schema);
                    fc_success(success);
                },
                error => {
                    fc_error(error);
                }
            );
            return resource;
        }

        public _delete(id: String, params, fc_success, fc_error): void {
            // http request
            let path = new Jsonapi.PathMaker();
            path.addPath(this.getPath());
            path.addPath(id);

            Jsonapi.Core.Services.JsonapiHttp
            .delete(path.get())
            .then(
                success => {
                    fc_success(success);
                },
                error => {
                    fc_error(error);
                }
            );
        }

        public _save(params: IParams, fc_success: Function, fc_error: Function): IResource {
            let object = this.toObject(params);

            // http request
            let path = new Jsonapi.PathMaker();
            path.addPath(this.getPath());
            this.id && path.addPath(this.id);
            params.include ? path.setInclude(params.include) : null;

            let resource = this.new();

            let promise = Jsonapi.Core.Services.JsonapiHttp.exec(path.get(), this.id ? 'PUT' : 'POST', object);

            promise.then(
                success => {
                    let value = success.data.data;
                    resource.attributes = value.attributes;
                    resource.id = value.id;

                    fc_success(success);
                },
                error => {
                    fc_error('data' in error ? error.data : error);
                }
            );

            return resource;
        }

        public addRelationship(resource: Jsonapi.IResource, type_alias?: string) {
            type_alias = (type_alias ? type_alias : resource.type);
            if (!(type_alias in this.relationships)) {
                this.relationships[type_alias] = { data: { } };
            }

            let object_key = resource.id;
            if (!object_key) {
                object_key = 'new_' + (Math.floor(Math.random() * 100000));
            }

            this.relationships[type_alias]['data'][object_key] = resource;
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

        /**
        @return This resource like a service
        **/
        public getService(): any {
            return Converter.getService(this.type);
        }
    }
}
