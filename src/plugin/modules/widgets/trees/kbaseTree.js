/**
 * @author Bill Riehl <wjriehl@lbl.gov>, Roman Sutormin <rsutormin@lbl.gov>
 * @public
 */
define([
    'jquery',
    'uuid',
    'kb_common/html',
    'kb_service/client/workspace',
    'kb_service/client/userAndJobState',
    'kb_dataview_easyTree',

    'kb_widget/legacy/authenticatedWidget'
], function(
    $, 
    Uuid, 
    html, 
    Workspace, 
    UserAndJobState, 
    EasyTree
) {
    'use strict';

    $.KBWidget({
        name: 'kbaseTree',
        parent: 'kbaseAuthenticatedWidget',
        version: '0.0.1',
        options: {
            treeID: null,
            workspaceID: null,
            treeObjVer: null,
            jobID: null,
            token: null,
            width: 1045,
            height: 600
        },
        treeWsRef: null,
        pref: null,
        timer: null,
        init: function(options) {
            this._super(options);
            this.pref = new Uuid(4).format();

            if (!this.options.treeID) {
                this.renderError('No tree to render!');
                return this;
            }

            if (!this.options.workspaceID) {
                this.renderError('No workspace given!');
                return this;
            }

            this.wsClient = new Workspace(this.runtime.getConfig('services.workspace.url'), {
                token: this.runtime.service('session').getAuthToken()
            });
            this.$messagePane = $('<div/>')
                .addClass('kbwidget-message-pane kbwidget-hide-message');
            this.$elem.append(this.$messagePane);

            this.render();

            return this;
        },
        render: function() {
            this.loading(false);
            if (this.treeWsRef || this.options.jobID === null) {
                this.loadTree();
            } else {
                var self = this;
                var jobSrv = new UserAndJobState(this.runtime.getConfig('services.ujs.url'), {
                    token: this.runtime.service('session').getAuthToken()
                });
                self.$elem.empty();

                var panel = $('<div class="loader-table"/>');
                self.$elem.append(panel);
                var table = $('<table class="table table-striped table-bordered" ' +
                    'style="margin-left: auto; margin-right: auto;" id="' + self.pref + 'overview-table"/>');
                panel.append(table);
                table.append('<tr><td>Job was created with id</td><td>' + self.options.jobID + '</td></tr>');
                table.append('<tr><td>Output result will be stored as</td><td>' + self.options.treeID + '</td></tr>');
                table.append('<tr><td>Current job state is</td><td id="' + self.pref + 'job"></td></tr>');
                var timeLst = function() {
                    jobSrv.get_job_status(self.options.jobID)
                        .then(function(data) {
                            var status = data[2];
                            var complete = data[5];
                            var wasError = data[6];
                            var tdElem = $('#' + self.pref + 'job');
                            if (status === 'running') {
                                tdElem.html(html.loading(status));
                            } else {
                                tdElem.html(status);
                            }
                            if (complete === 1) {
                                clearInterval(self.timer);
                                if (this.treeWsRef) {
                                    // Just skip all this cause data was already showed through setState()
                                } else {
                                    if (wasError === 0) {
                                        self.loadTree();
                                    }
                                }
                            }
                        })
                        .catch(function(data) {
                            clearInterval(self.timer);
                            if (this.treeWsRef) {
                                // Just skip all this cause data was already showed through setState()
                            } else {
                                var tdElem = $('#' + self.pref + 'job');
                                tdElem.html('Error accessing job status: ' + data.error.message);
                            }
                        });
                };
                timeLst();
                self.timer = setInterval(timeLst, 5000);
            }
        },
        loadTree: function() {
            var objId = this.buildObjectIdentity(this.options.workspaceID, this.options.treeID, this.options.treeObjVer, this.treeWsRef);
            var self = this;
            this.wsClient.get_objects([objId])
                .then(function(objArr) {
                    self.$elem.empty();

                    var canvasDivId = 'knhx-canvas-div-' + self.pref;
                    self.canvasId = 'knhx-canvas-' + self.pref;
                    self.$canvas = $('<div id="' + canvasDivId + '">')
                        .append($('<canvas id="' + self.canvasId + '">'));

                    if (self.options.height) {
                        self.$canvas.css({ 'max-height': self.options.height - 85, 'overflow': 'scroll' });
                    }
                    self.$elem.append(self.$canvas);

                    // SKIP FOR NOW
                    //watchForWidgetMaxWidthCorrection(canvasDivId);

                    if (!self.treeWsRef) {
                        var info = objArr[0].info;
                        self.treeWsRef = info[6] + '/' + info[0] + '/' + info[4];
                    }
                    var tree = objArr[0].data;

                    var refToInfoMap = {};
                    var objIdentityList = [];
                    if (tree.ws_refs) {
                        var key;
                        for (key in tree.ws_refs) {
                            if (tree.ws_refs[key]['g'] && tree.ws_refs[key]['g'].length > 0)
                                objIdentityList.push({ ref: tree.ws_refs[key]['g'][0] });
                        }
                    }

                    if (objIdentityList.length > 0) {
                        return self.wsClient.get_object_info_new({ objects: objIdentityList })
                            .then(function(data) {
                                var i;
                                for (i in data) {
                                    var objInfo = data[i];
                                    refToInfoMap[objIdentityList[i].ref] = objInfo;
                                }
                                return [tree, refToInfoMap];
                            });
                    } else {
                        return [tree, refToInfoMap];
                    }
                })
                .spread(function(tree, refToInfoMap) {
                    var url;
                    new EasyTree(self.canvasId, tree.tree, tree.default_node_labels, function(node) {
                        if ((!tree.ws_refs) || (!tree.ws_refs[node.id])) {
                            var node_name = tree.default_node_labels[node.id];
                            if (node_name.indexOf('/') > 0) { // Gene label
                                /* TODO: reroute #genes to #dataview */
                                url = '#genes/' + self.options.workspaceID + '/' + node_name;
                                window.open(url, '_blank');
                            }
                            return;
                        }
                        var ref = tree.ws_refs[node.id]['g'][0];
                        var objInfo = refToInfoMap[ref];
                        if (objInfo) {
                            url = '#dataview/' + objInfo[7] + '/' + objInfo[1];
                            window.open(url, '_blank');
                        }
                    }, function(node) {
                        if (node.id && node.id.indexOf('user') === 0) {
                            return '#0000ff';
                        }
                        return null;
                    });
                    self.loading(true);
                    return true;
                })
                .catch(function(error) {
                    self.renderError(error);
                });
        },
        renderError: function(error) {
            var errString = 'Sorry, an unknown error occurred';
            if (typeof error === 'string') {
                errString = error;
            } else if (error.error && error.error.message) {
                errString = error.error.message;
            }

            var $errorDiv = $('<div>')
                .addClass('alert alert-danger')
                .append('<b>Error:</b>')
                .append('<br>' + errString);
            this.$elem.empty();
            this.$elem.append($errorDiv);
        },
        getData: function() {
            return {
                type: 'Tree',
                id: this.options.treeID,
                workspace: this.options.workspaceID,
                title: 'Tree'
            };
        },
        buildObjectIdentity: function(workspaceID, objectID, objectVer, wsRef) {
            var obj = {};
            if (wsRef) {
                obj['ref'] = wsRef;
            } else {
                if (/^\d+$/.exec(workspaceID)) {
                    obj['wsid'] = workspaceID;
                } else {
                    obj['workspace'] = workspaceID;
                }

                // same for the id
                if (/^\d+$/.exec(objectID)) {
                    obj['objid'] = objectID;
                } else {
                    obj['name'] = objectID;
                }

                if (objectVer) {
                    obj['ver'] = objectVer;
                }
            }
            return obj;
        },
        loading: function(doneLoading) {
            if (doneLoading) {
                this.hideMessage();
            } else {
                this.showMessage(html.loading());
            }
        },
        showMessage: function(message) {
            var span = $('<span/>').append(message);

            this.$messagePane.append(span);
            this.$messagePane.show();
        },
        hideMessage: function() {
            this.$messagePane.hide();
            this.$messagePane.empty();
        },
        getState: function() {
            var self = this;
            var state = {
                treeWsRef: self.treeWsRef
            };
            return state;
        },
        loadState: function(state) {
            var self = this;
            if (state && state.treeWsRef) {
                self.treeWsRef = state.treeWsRef;
                self.render();
            }
        }

    });
});