/**
 * @license
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

CLASS({
  package: 'foam.documentation',
  name: 'DocModelFeatureDAOTrait',
  documentation: "Generates a featureDAO of all the inherited features of a $$DOC{ref:'Model'}.",

  requires: [
    'foam.documentation.DocFeatureInheritanceTracker',
    'foam.documentation.DocModelInheritanceTracker',
    'Model',
    'MDAO'
  ],

  imports: [ 'masterModelList', 'featureDAO' ],
  exports: ['featureDAO', 'modelDAO', 'subModelDAO', 'traitUserDAO'],

  properties: [
    {
      name: 'featureDAO',
      model_: 'foam.core.types.DAOProperty',
      factory: function() {
        return this.MDAO.create({model:this.DocFeatureInheritanceTracker, autoIndex:true});
      }
    },
    {
      name: 'modelDAO',
      model_: 'foam.core.types.DAOProperty',
      factory: function() {
        return this.MDAO.create({model:this.DocModelInheritanceTracker, autoIndex:true});
      }
    },
    {
      name: 'subModelDAO',
      model_: 'foam.core.types.DAOProperty',
      factory: function() {
        return this.MDAO.create({model:this.Model, autoIndex:true});
      }
    },
    {
      name: 'traitUserDAO',
      model_: 'foam.core.types.DAOProperty',
      factory: function() {
        return this.MDAO.create({model:this.Model, autoIndex:true});
      }
    }
  ],

  methods: {

    generateFeatureDAO: function(data) {
      /* Builds a feature DAO to sort out inheritance and overriding of
        $$DOC{ref:'Property',usePlural:true}, $$DOC{ref:'Method',usePlural:true},
        and other features. */

      //var startTime = Date.now();
      //console.log("Generating FeatureDAO...", this.data );

      this.featureDAO.removeAll();
      this.modelDAO.removeAll();
      this.subModelDAO.removeAll();
      this.traitUserDAO.removeAll();

      if ( ! data.model_ || data.model_.id !== 'Model' ) {
        console.warn("ModelDocView created with non-model instance: ", data);
        return;
      }

      if ( ! this.Y.modelDAO ) {
        // we aren't done init yet, so wait and our init(); will call us again
        return;
      }

      // Run through the features in the Model definition in this.data,
      // and load them into the feature DAO. Passing [] assumes we don't
      // care about other models that extend this one. Finding such would
      // be a global search problem.
      this.Y.setTimeout(function() {
        this.agetInheritanceMap(this.loadFeaturesOfModel, data, { data: data });
      }.bind(this), 20);
      this.Y.setTimeout(function() {
          this.findSubModels(data);
          this.findTraitUsers(data);
      }.bind(this), 500);

      //console.log("  FeatureDAO complete.", Date.now() - startTime);

      //this.debugLogFeatureDAO();
    },
    
    agetInheritanceMap: function(ret, model, map) {
      // find all base models of the given model, put into list
      this.X.masterModelList.where(IN(Model.ID, model.traits)).select({
          put: function(m) {
            map[m.id] = m;
          },
          eof: function() {
            if ( model.extendsModel ) {
              this.X.masterModelList.where(EQ(Model.ID, model.extendsModel)).select({
                  put: function(ext) {
                    map[ext.id] = ext;
                    this.agetInheritanceMap(ret, ext, map);
                  }.bind(this)
              }); 
            } else {
              ret && ret(map); // no more extendsModels to follow, finished
            }
          }.bind(this)
      });

    },


    debugLogFeatureDAO: function() {
      /* For debugging purposes, prints out the state of the FeatureDAO. */

      var features = [];
      console.log("Features DAO: ", this.featureDAO);
      this.featureDAO.select(features);
      console.log(features);

      var modelss = [];
      console.log("Model    DAO: ", this.modelDAO);
      this.modelDAO.select(modelss);
      console.log(modelss);
    },

    findSubModels: function(data) {
      if ( ! this.Model.isInstance(data) ) return;     
      this.findDerived(data);
    },

    findTraitUsers: function(data) {
      if ( ! this.Model.isInstance(data) ) return;

      this.masterModelList.select(MAP(
        function(obj) {
          if ( obj.traits &&  obj.traits.indexOf(data.id) > -1 ) {
            this.traitUserDAO.put(obj);
          }
        }.bind(this)
      ));
    }

  },
  
  listeners: [
    {
      name: 'findDerived',
      whenIdle: true,
      code: function(extendersOf) { 
        this.masterModelList.select(MAP(
          function(obj) {
            if ( obj.extendsModel == extendersOf.id ) {
              this.subModelDAO.put(obj);
              // for performance, spread out the load
              this.X.setTimeout(function() { this.findDerived(obj); }.bind(this), 200);
            }
          }.bind(this)
        ));
      }

    },
    {
      name: 'loadFeaturesOfModel',
      code: function(map, previousExtenderTrackers, traitInheritanceLevel) {
        /* <p>Recursively load features of this $$DOC{ref:'Model'} and
          $$DOC{ref:'Model',usePlural:true} it extends.</p>
          <p>Returns the inheritance level of model (0 = $$DOC{ref:'Model'}).
          </p>
          */
        var model = map.data;
          
        if (typeof previousExtenderTrackers == 'undefined') {
          previousExtenderTrackers = [];
        }
        var isTrait = true;
        if (typeof traitInheritanceLevel == 'undefined') {
          traitInheritanceLevel = 0;
          isTrait = false;
        }
        var modelDef = model.definition_?  model.definition_: model;
        var self = this;
        var newModelTr = this.DocModelInheritanceTracker.create();
        newModelTr.model = model.id;
  
        [ 'properties', 
          'methods',
          'actions',
          'listeners',
          'models',
          'relationships',
          'templates'].forEach(function(modProp) {
          var modPropVal = modelDef[modProp];
          if ( Array.isArray(modPropVal) ) { // we only care to check inheritance on the array properties
            modPropVal.forEach(function(feature) {
              if ( feature.name ) { // only look at actual objects
                // all features we hit are declared (or overridden) in this model
                var featTr = self.DocFeatureInheritanceTracker.create({
                      isDeclared:true,
                      feature: feature,
                      model: newModelTr.model,
                      type: modProp,
                      fromTrait: isTrait
                });
                self.featureDAO.put(featTr);
  
                // for the models that extend this model, make sure they have
                // the feature too, if they didn't already have it declared (overridden).
                // isTrait is not set, as we don't distinguish between inherited trait features and
                // extendsModel features.
                previousExtenderTrackers.forEach(function(extModelTr) {
                  self.featureDAO
                        .where(EQ(self.DocFeatureInheritanceTracker.PRIMARY_KEY,
                                  extModelTr.model+":::"+feature.name))
                        .select(COUNT())(function(c) {
                            if (c.count <= 0) {
                              var featTrExt = self.DocFeatureInheritanceTracker.create({
                                  isDeclared: false,
                                  feature: feature,
                                  model: extModelTr.model,
                                  type: modProp });
                              self.featureDAO.put(featTrExt);
                            }
                        });
                });
              }
            });
          }
        });
  
        if ( ! isTrait ) {
          // Check if we extend something, and recurse.
          if (!model.extendsModel) {
            newModelTr.inheritanceLevel = 0;
          } else {
            // add the tracker we're building to the list, for updates from our base models
            previousExtenderTrackers.push(newModelTr);
            // inheritance level will bubble back up the stack once we know where the bottom is.
            // pass a copy of previousExtenderTrackers so we know what to update in the traits section after.
            newModelTr.inheritanceLevel = 1 + this.loadFeaturesOfModel(
              { __proto__: map, data: map[model.extendsModel] },
              previousExtenderTrackers.slice(0));
          }
  
          // Process traits with the same inheritance level we were assigned, since they appear first in the
          // apparent inheritance chain before our extendsModel.
          if (model.traits && model.traits.length > 0) {
            model.traits.forEach(function(trait) {
              var traitExtenderTrackers = previousExtenderTrackers.slice(0);
              traitExtenderTrackers.push(newModelTr);
              this.loadFeaturesOfModel(
                { __proto__: map, data: map[trait] },
                traitExtenderTrackers,
                newModelTr.inheritanceLevel);
            }.bind(this));
          }
        }
  
        // the tracker is now complete
        this.modelDAO.put(newModelTr);
        return newModelTr.inheritanceLevel;
      }
        
    }
  ]


});