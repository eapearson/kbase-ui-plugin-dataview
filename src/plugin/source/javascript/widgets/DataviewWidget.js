define([
    'nunjucks',
    'jquery',
    'bluebird',
    'kb.runtime',
    'kb.utils',
    'kb.alert',
    'kb.html',
    'kb_plugin_dataview'
],
    function (nunjucks, $, Promise, R, Utils, Alert, html, Plugin) {
        "use strict";
        var widget = Object.create({}, {
            // The init function interfaces this object with the caller, and sets up any 
            // constants and constant state.
            DataviewWidget_init: {
                value: function (cfg) {
                    this._generatedId = 0;

                    // First we get the global config.

                    // The global config is derived from the module definition, which gets it from the 
                    // functional site main config file directly. The setup property of the config defines
                    // the current set of settings (production, development, etc.)
                    // this.globalConfig = config[config.setup];

                    // TODO: implement local config and config merging.
                    this.localConfig = {};
                    this.initConfig = cfg || {};
                    this.setupConfig();

                    // PARAMS          
                    // The params object is used to hold any parameterized input.
                    // Note that params may change. E.g. the user may select another 
                    // member profile to view.
                    this.params = {};

                    // Also the userId is required -- this is the user for whom the social widget is concerning.
                    // by convention, if the userId is empty, we use the current logged in user.
                    // This allows creating links to social widgets in some contexts in which the username can't be
                    // placed onto the url.
                    if (Utils.isBlank(cfg.userId)) {
                        if (R.isLoggedIn()) {
                            this.params.userId = R.getUsername();
                        }
                    } else {
                        this.params.userId = cfg.userId;
                    }

                    // AUTH
                    // Auth information is derived from the auth widget.
                    // Auth state can change at any time -- the syncAuth method knows how to 
                    // rebuild the widget after auth state change.
                    // this.setupAuth();


                    // Set up widget based on the config, params, and auth.
                    this.setupCoreApp();

                    this.setup();


                    // MESSAGES
                    // The widget supports arbitrary messages provided by the widget code to the
                    // interface. A simple list.
                    this.messages = [];

                    // ERROR
                    this.error = null;

                    // The state object is used to hold any data generated by this 
                    // widget.
                    // It is merged onto the context object prior to rendering.
                    // state is either: none, initialized, changed, 
                    this.state = {};
                    this.stateMeta = {
                        status: 'none',
                        timestamp: new Date()
                    }

                    // Creates maps out of lists.
                    this.createListMaps();

                    // Set up the templating system.
                    // NB the templating requires a dedicated widget resources directory in 
                    //   /src/widgets/WIDGETNAME/templates
                    this.templates = {};
                    this.templates.env = new nunjucks.Environment(new nunjucks.WebLoader(Plugin.plugin.path + '/javascript/widgets/' + this.widgetName + '/templates'), {
                        'autoescape': false
                    });

                    this.templates.env.addFilter('kbmarkup', function (s) {
                        s = s.replace(/\n/g, '<br>');
                        return s;
                    });
                    // This is the cache of templates.
                    this.templates.cache = {};

                    // The context object is what is given to templates.
                    this.context = {};
                    this.context.env = {
                        widgetTitle: this.widgetTitle,
                        widgetName: this.widgetName,
                        docsite: R.getConfig('docsite'),
                        browser: {
                            location: {
                                scheme: window.location.protocol,
                                host: window.location.host,
                                path: window.location.pathname

                            }
                        }
                    };
                    // NB this means that when clearing state or params, the object
                    // should not be blown away.
                    this.context.state = this.state;
                    this.context.params = this.params;


                    // Set up listeners for any kbase events we are interested in:
                    // NB: following tradition, the auth listeners are namespaced for kbase; the events
                    // are not actually emitted in the kbase namespace.
                    /*
                     this.subscriptions = [];
                     this.subscriptions.push(Postal.channel('session').subscribe('login.success', function (data) {
                     this.onLoggedIn(data.session);
                     }.bind(this)));
                     
                     this.subscriptions.push(Postal.channel('session').subscribe('logout.success', function () {
                     console.log('running logout.success postal event')
                     if (this.onLoggedOut) {
                     try {
                     console.log('about to do onLoggedOut');
                     this.onLoggedOut();
                     console.log('about to do done...');
                     } catch (ex) {
                     console.error('Error in onLoggedOut');
                     console.log(ex);
                     }
                     }
                     }.bind(this)));
                     */

                    this.alert = Object.create(Alert).init();

                    // The status of the widget.
                    this.status = 'ready';

                    return this;
                }
            },
            setupConfig: {
                value: function () {

                    this.configs = [{}, this.initConfig, this.localConfig];

                    // Check for required and apply defaults.
                    if (!this.hasConfig('container')) {
                        throw 'A container is required by this Widget, but was not provided.';
                    }

                    if (!this.hasConfig('name')) {
                        throw 'Widget name is required';
                    }

                    if (!this.hasConfig('title')) {
                        throw 'Widget title is required';
                    }

                }
            },
            setupCoreApp: {
                value: function () {
                    // Should be run after configuration changes.
                    // May touch parts of the widget object, so care should be taken
                    // to syncronize or just plain rebuild.

                    this.container = this.getConfig('container');
                    if (typeof this.container === 'string') {
                        this.container = $(this.container);
                    }

                    // OTHER CONFIG
                    // The widget requires a name to use for various purposes.
                    this.widgetName = this.getConfig('name');

                    this.widgetTitle = this.getConfig('title');


                    this.instanceId = this.genId();

                    return;
                }
            },
            // setupAuth: {
            //    value: function () {
            //       Session.refreshSession();
            //    }
            // },

            // LIFECYCLE

            start: {
                value: function () {
                    // This creates the initial UI -- loads the css, inserts layout html.
                    // For simple widgets this is all the setup needed.
                    // For more complex one, parts of the UI may be swapped out.
                    this.setupUI();
                    this.renderWaitingView();
                    this.setInitialState()
                        .then(function () {
                            this.initialDataLoaded = true;
                            return this.refresh()
                        }.bind(this))
                        .catch(function (err) {
                            console.log('ERROR');
                            console.log(err);
                            this.setError(err);
                        }.bind(this))
                        .done();
                }
            },
            setup: {
                value: function () {
                    // does whatever the widget needs to do to set itself up
                    // after config, params, and auth have been configured.

                    return this;
                }
            },
            setupUI: {
                value: function () {
                    this.loadCSS();
                    this.renderLayout();
                    return this;
                }
            },
            stop: {
                value: function () {
                    this.status = 'stopped';
                    /*
                     this.subscriptions.forEach(function(subscription) {
                     subscription.unsubscribe();
                     });
                     this.subscriptions = [];
                     console.log('usubscribed!');
                     */
                }
            },
            destroy: {
                value: function () {
                    // tear down any events, etc. that are not attached
                    // to the local container.
                }
            },
            // CONFIG
            getConfig: {
                value: function (key, defaultValue) {
                    for (var i = 0; i < this.configs.length; i++) {
                        if (Utils.getProp(this.configs[i], key) !== undefined) {
                            return Utils.getProp(this.configs[i], key);
                        }
                    }
                    return defaultValue;
                }
            },
            setConfig: {
                value: function (key, value) {
                    // sets it on the first config, which is the override config.
                    Utils.setProp(this.configs[0], key, value);
                }
            },
            hasConfig: {
                value: function (key) {
                    for (var i = 0; i < this.configs.length; i++) {
                        if (Utils.getProp(this.configs[i], key) !== undefined) {
                            return true;
                        }
                    }
                    return false;
                }
            },
            // PARAMETERS
            // Parameters are typically passed into the init() method, and represent external values that vary for each 
            // new object. Typical use cases are url query variables.
            setParam: {
                value: function (path, value) {
                    Utils.setProp(this.params, path, value);
                    this.refresh().done();
                }
            },
            getParam: {
                value: function (path, defaultValue) {
                    return Utils.getProp(this.params, path, defaultValue);
                }
            },
            recalcState: {
                value: function () {
                    this.setInitialState()
                        .then(function () {
                            return this.refresh();
                        }.bind(this))
                        .catch(function (err) {
                            this.setError(err);
                        }.bind(this))
                        .done();
                }
            },
            refresh: {
                value: function () {
                    return new Promise(function (resolve, reject, notify) {
                        if (this.initialDataLoaded) {
                            if (!this.refreshTimer) {
                                this.refreshTimer = window.setTimeout(function () {
                                    this.refreshTimer = null;
                                    this.render();
                                    resolve(true);
                                }.bind(this), 0);
                            }
                        } else {
                            resolve(false);
                        }
                    }.bind(this));
                }
            },
            // STATE CHANGES

            /*
             getCurrentState
             This should do prepare the internal state to the point at
             which rendering can occur. It will typically fetch all data and stache it, 
             and perhaps perform some rudimentary analysis.
             */
            setState: {
                value: function (path, value, norefresh) {
                    Utils.setProp(this.state, path, value);
                    if (!norefresh) {
                        this.refresh().done();
                    }
                }
            },
            hasState: {
                value: function (path) {
                    return Utils.hasProp(this.state, path);
                }
            },
            getState: {
                value: function (path, defaultValue) {
                    return Utils.getProp(this.state, path, defaultValue);
                }
            },
            setError: {
                value: function (errorValue) {
                    if (!errorValue) {
                        return;
                    }

                    var errorText;
                    if (typeof errorValue === 'string') {
                        errorText = errorValue;
                    } else if (typeof errorValue === 'object') {
                        if (errorValue.message) {
                            errorText = errorValue.message;
                        } else if (errorValue.error && errorValue.error.message) {
                            errorText = errorValue.error.message;
                        } else {
                            errorText = 'Unknown error';
                        }
                    }
                    this.error = {
                        message: errorText,
                        original: errorValue
                    }
                    this.refresh().done();
                }
            },
            checkState: {
                value: function (status) {
                    if (this.stateMeta.status === status) {
                        return true;
                    } else {
                        return false;
                    }
                }
            },
            setInitialState: {
                value: function (options) {
                    // The base method just resolves immediately (well, on the next turn.) 
                    return new Promise(function (resolve, reject, notify) {
                        resolve();
                    });
                }
            },
            // EVENT HANDLERS

            onLoggedIn: {
                value: function (auth) {
                    //this.setupAuth();
                    this.setup();
                    this.setInitialState({
                        force: true
                    })
                        .then(function () {
                            this.refresh();
                        }.bind(this));
                }
            },
            onLoggedOut: {
                value: function () {
                    // this.setupAuth();
                    this.setup();
                    this.setInitialState({
                        force: true
                    })
                        .then(function () {
                            this.refresh();
                        }.bind(this));
                }
            },
            // STATE CALCULATIONS

            // TEMPLATES
            getTemplate: {
                value: function (name) {
                    if (this.templates.cache[name] === undefined) {
                        this.templates.cache[name] = this.templates.env.getTemplate(name + '.html');
                    }
                    return this.templates.cache[name];
                }
            },
            createTemplateContext: {
                value: function (additionalContext) {
                    /*
                     var context = this.merge({}, this.context);
                     return this.merge(context, {
                     state: this.state, 
                     params: this.params
                     })
                     */

                    // We need to ensure that the context reflects the current auth state.
                    this.context.params = this.params;
                    this.context.env.generatedId = this.genId();
                    this.context.env.loggedIn = R.isLoggedIn();
                    if (R.isLoggedIn()) {
                        this.context.env.loggedInUser = R.getUsername();
                        //this.context.env.loggedInUserRealName = Session.getUserRealName();
                    } else {
                        delete this.context.env.loggedInUser;
                        //delete this.context.env.loggedInUserRealName;
                    }

                    this.context.env.instanceId = this.instanceId;

                    if (additionalContext) {
                        var temp = Utils.merge({}, this.context);
                        return Utils.merge(temp, additionalContext);
                    } else {
                        return this.context;
                    }
                }
            },
            renderTemplate: {
                value: function (name, context) {
                    var template = this.getTemplate(name);
                    if (!template) {
                        throw 'Template ' + name + ' not found';
                    }
                    var context = context ? context : this.createTemplateContext();
                    return template.render(context);
                }
            },
            // Generates a unique id for usage on synthesized dom elements.
            genId: {
                value: function () {
                    return 'gen_' + this.widgetName + '_' + this._generatedId++;
                }
            },
            renderError: {
                value: function () {
                    var context = this.createTemplateContext({
                        error: {
                            message: Utils.getProp(this.error, 'message')
                        }
                    });
                    this.places.content.html(this.getTemplate('error').render(context));
                }
            },
            renderErrorView: {
                value: function (error) {
                    // Very simple error view.

                    if (error) {
                        var errorText;
                        if (typeof error === 'string') {
                            errorText = error;
                        } else if (typeof error === 'object') {
                            if (error instanceof Error) {
                                errorText = error.message;
                            } else {
                                error = '' + error;
                            }
                        }
                    }

                    var context = this.createTemplateContext({
                        error: errorText
                    });
                    this.places.content.html(this.getTemplate('error').render(context));
                }
            },
            // DOM UPDATE

            // An example universal renderer, which inspects the state of the widget and
            // displays the appropriate content.
            render: {
                value: function () {
                    // Generate initial view based on the current state of this widget.
                    // Head off at the pass -- if not logged in, can't show profile.
                    if (this.error) {
                        this.renderError();
                    } else {
                        // no profile, no basic aaccount info
                        this.places.title.html(this.widgetTitle);
                        this.places.content.html(this.renderTemplate('main'));
                    }
                    // this.container.find('.collapse').collapse();
                    if (this.afterRender) {
                        this.afterRender();
                    }
                    return this;
       }
            },
            // These are some very basic renderers for common functions. 

            // This can provide an initial layout, such as a panel, and provide container nodes,
            // such as title and content.
            renderLayout: {
                value: function () {
                    this.container.html(this.getTemplate('layout').render(this.createTemplateContext()));
                    this.places = {
                        title: this.container.find('[data-placeholder="title"]'),
                        alert: this.container.find('[data-placeholder="alert"]'),
                        content: this.container.find('[data-placeholder="content"]')
                    };
                    // hook up the alert messages.
                    this.alert.setContainer(this.places.alert);
                }
            },
            // Render a waiting icon while.
            // This is typically done before getCurrentState which might be doing a time consuming ajax call
            // to fetch data.
            // NB depends on assets.
            renderWaitingView: {
                value: function () {
                    this.places.content.html(html.loading());
                }
            },
            loadCSS: {
                value: function () {
                    // Load social widget css.
                    $('<link>')
                        .appendTo('head')
                        .attr({
                            type: 'text/css',
                            rel: 'stylesheet'
                        })
                        .attr('href', '/src/widgets/dataview/style.css');
                    // Load specific widget css.
                    $('<link>')
                        .appendTo('head')
                        .attr({
                            type: 'text/css',
                            rel: 'stylesheet'
                        })
                        .attr('href', '/src/widgets/dataview/' + this.widgetName + '/style.css');
                }
            },
            makeWorkspaceObjectId: {
                value: function (workspaceId, objectId) {
                    return 'ws.' + workspaceId + '.obj.' + objectId;
                }
            },
            object_to_array: {
                value: function (object, keyName, valueName) {
                    var keys = Object.keys(object);
                    var l = [];
                    for (var i in keys) {
                        var newObj = {};
                        newObj[keyName] = keys[i];
                        newObj[valueName] = object[keys[i]];
                        l.push(newObj);
                    }
                    return l;
                }
            },
            // KBase Service Utility Methods
            // NB: these should really be contained in the service apis, but those are automatically generated.
            // Maybe a kbase services utility module?
            workspace_metadata_to_object: {
                value: function (wsInfo) {
                    return {
                        id: wsInfo[0],
                        name: wsInfo[1],
                        owner: wsInfo[2],
                        moddate: wsInfo[3],
                        object_count: wsInfo[4],
                        user_permission: wsInfo[5],
                        globalread: wsInfo[6],
                        lockstat: wsInfo[7],
                        metadata: wsInfo[8]
                    };
                }
            },
            /*UnspecifiedObject data;
             object_info info;
             list<ProvenanceAction> provenance;
             username creator;
             timestamp created;
             list<obj_ref> refs;
             obj_ref copied;
             boolean copy_source_inaccessible;
             mapping<id_type, list<extracted_id>> extracted_ids;
             string handle_error;
             string handle_stacktrace;
             */

            workspace_object_to_object: {
                value: function (data) {
                    data.info = this.object_info_to_object(data.info);
                    return data;
                }

            },
            object_info_to_object: {
                value: function (data) {
                    var type = data[2].split(/[-\.]/);

                    return {
                        id: data[0],
                        name: data[1],
                        type: data[2],
                        save_date: data[3],
                        version: data[4],
                        saved_by: data[5],
                        wsid: data[6],
                        ws: data[7],
                        checksum: data[8],
                        size: data[9],
                        metadata: data[10],
                        ref: data[7] + '/' + data[1],
                        obj_id: 'ws.' + data[6] + '.obj.' + data[0],
                        typeName: type[1],
                        typeMajorVersion: type[2],
                        typeMinorVersion: type[3]
                    };
                }
            },
            logNotice: {
                value: function (source, message) {
                    console.log('NOTICE: [' + source + '] ' + message);
                }
            },
            logDeprecation: {
                value: function (source, message) {
                    console.log('DEPRECATION: [' + source + '] ' + message);
                }
            },
            logWarning: {
                value: function (source, message) {
                    console.log('WARNING: [' + source + '] ' + message);
                }
            },
            logError: {
                value: function (source, message) {
                    console.log('ERROR: [' + source + '] ' + message);
                }
            },
            createListMaps: {
                value: function () {
                    this.listMaps = {};
                    for (var listId in this.lists) {
                        var list = this.lists[listId];

                        this.listMaps[listId] = {};

                        for (var i in list) {
                            this.listMaps[listId][list[i].id] = list[i];
                        }
                    }
                }
            },
            lists: {
                value: {
                    permissionFlags: [{
                            id: 'r',
                            label: 'Read',
                            description: 'Read Only'
                        },
                        {
                            id: 'w',
                            label: 'Write',
                            description: 'Read and Write'
                        },
                        {
                            id: 'a',
                            label: 'Admin',
                            description: 'Read, Write, and Share'
                        },
                        {
                            id: 'n',
                            label: 'None',
                            description: 'No Access'
                        }]


                }
            }

        });

        return widget;
    });