define([
    'bluebird',
    'jquery',
    'preact',
    'htm',
    'kb_lib/jsonRpc/dynamicServiceClient',
    'components/Table',
    'content',

    'kbaseUI/widget/legacy/kbaseTabs',
    'kbaseUI/widget/legacy/authenticatedWidget',
    'kbaseUI/widget/legacy/tabs',
    'datatables_bootstrap'
], function (
    Promise,
    $,
    preact,
    htm,
    DynamicServiceClient,
    Table,
    content
) {
    'use strict';

    const html = htm.bind(preact.h);

    function checkObjectRef(ref) {
        // return true if this.options.objRef = a reference or reference path
        // return false otherwise
        if (!ref) {
            return false;
        }
        var refRegex = /^\S+\/\S+(\/\d+)?$/;
        var refList = ref.split(';');
        var validRef = true;
        refList.forEach(function (r) {
            if (!refRegex.exec(r)) {
                validRef = false;
            }
        });
        return validRef;
    }

    function createError(title, error, stackTrace) {
        var $errorPanel = $('<div>')
            .addClass('alert alert-danger')
            .append('<b>' + title + '</b><br>Please contact the KBase team at <a href="http://kbase.us/contact-us/">http://kbase.us/contact-us/</a> with the information below.');

        $errorPanel.append('<br><br>');

        // If it's a string, just dump the string.
        if (typeof error === 'string') {
            $errorPanel.append(error);
        }

        // If it's an object, expect an error object
        else if (typeof error === 'object') {
            var errObj = error;
            if (error.status && error.error && error.error.error) {
                errObj = {
                    status: error.status,
                    code: error.error.code,
                    message: error.error.message,
                    name: error.error.name
                };
                if (!stackTrace) {
                    stackTrace = error.error.error;
                }
            }
            Object.keys(errObj).forEach(function (key) {
                $errorPanel.append($('<div>').append('<b>' + key + ':</b> ' + errObj[key]));
            });
        }
        else if (error) {
            $errorPanel.append('No other information available. Sorry!');
        }
        // TODO: restore
        // if (stackTrace) {
        //     var $traceAccordion = $('<div>');
        //     $errorPanel.append($traceAccordion);
        //     new KBaseAccordion($traceAccordion, {
        //         elements: [
        //             {
        //                 title: 'Error Details',
        //                 body: $('<pre>').addClass('kb-function-error-traceback').append(stackTrace)
        //             }
        //         ]}
        //     );
        // }
        return $errorPanel;
    }

    return $.KBWidget({
        name: 'kbasePanGenome',
        parent: 'kbaseAuthenticatedWidget',
        version: '1.0.0',
        options: {
            ws: null,
            name: null,
            // loadingImage: Config.get('loading_gif'),
            withExport: false,
            pFamsPerPage: 10
        },
        token: null,

        init: function (options) {
            this._super(options);
            if (this.options.name.indexOf('/') > -1) {
                this.objRef = this.options.name;
            } else {
                this.objRef = this.options.ws + '/' + this.options.name;
            }
            if (!checkObjectRef(this.objRef)) {
                this.$elem.append(createError('Bad object.', 'PanGenome Object Unavailable.'));
                this.isError = true;
            }
            return this;
        },

        render: function () {
            if (this.isError) {
                return;
            }

            var $tabContainer = $('<div>');
            this.$elem.append($tabContainer);
            this.tabs = $tabContainer.kbaseTabs({
                tabPosition: top,
                canDelete: true,
                tabs: [{
                    tab: 'Pangenome Overview',
                    canDelete: false,
                    show: true,
                    showContentCallback: this.showSummary.bind(this)
                }, {
                    tab: 'Genome Comparison',
                    canDelete: false,
                    showContentCallback: this.showHomologFamilies.bind(this)
                },
                // {
                //     tab: 'Families',
                //     canDelete: false,
                //     showContentCallback: this.showProteinFamilies.bind(this)
                // },
                {
                    tab: 'Families',
                    canDelete: false,
                    showContentCallback: this.showProteinFamilies2.bind(this)
                }
                // {
                //     tab: 'Venn diagram',
                //     canDelete: false,
                //     showContentCallback: this.showVennDiagram.bind(this)
                // }
                ]
            });
            return this;
        },

        tableRow: function (items) {
            var $row = $('<tr>');
            items.forEach(function (item) {
                $row.append($('<td>').append(item));
            });
            return $row;
        },

        loading: function (message) {
            message = message || 'Loading...';
            return `<span><span>${message}</span><span class="fa fa-spinner fa-pulse fa-fw" style="margin-left: "6px"></span></span>`;
        },

        showSummary: function () {
            var self = this;
            var $summaryDiv = $('<div>').append(this.loading);
            const pangenomeClient = new DynamicServiceClient({
                module: 'PanGenomeAPI',
                url: this.runtime.config('services.ServiceWizard.url'),
                token: this.runtime.service('session').getAuthToken()
            });
            pangenomeClient.callFunc('compute_summary_from_pangenome', [{
                pangenome_ref: this.objRef
            }])
                .then(function ([data]) {
                    var $topTable = $('<table class="table table-hover table-striped table-bordered">');

                    $topTable
                        .append(self.tableRow(['Pan-genome object Id', self.options.name]))
                        .append(self.tableRow(['Total # of genomes', data.genomes_count]))
                        .append(self.tableRow(['Total # of protein coding genes', [
                            '<b>',
                            content.niceNumber(data.genes.genes_count),
                            '</b> genes with translation; <b>',
                            content.niceNumber(data.genes.homolog_family_genes_count),
                            '</b> are in homolog families; <b>',
                            content.niceNumber(data.genes.singleton_family_genes_count),
                            '</b> are in singleton families'
                        ].join(' ')]))
                        .append(self.tableRow(['Total # of families', [
                            '<b>',
                            content.niceNumber(data.families.families_count),
                            '</b> families; <b>',
                            content.niceNumber(data.families.homolog_families_count),
                            '</b> homolog families; <b>',
                            content.niceNumber(data.families.singleton_families_count),
                            '</b> singleton families'
                        ].join(' ')]));

                    var $genomeTable = $('<table class="table table-hover table-striped table-bordered">')
                        .append($('<tr>')
                            .append($('<th>Genome</th>'))
                            .append($('<th># Genes</th>'))
                            .append($('<th># Genes in Homologs</th>'))
                            .append($('<th># Genes in Singletons</th>'))
                            .append($('<th># Homolog Families</th>'))
                        );

                    Object.keys(data.genomes).forEach(function (genome) {
                        var genomeData = data.genomes[genome];
                        $genomeTable.append(self.tableRow([
                            genome,
                            content.niceNumber(genomeData.genome_genes),
                            content.niceNumber(genomeData.genome_homolog_family_genes),
                            content.niceNumber(genomeData.genome_singleton_family_genes),
                            content.niceNumber(genomeData.genome_homolog_family)
                        ]));
                    });

                    $summaryDiv.empty().append($topTable).append($genomeTable);
                })
                .catch(function (error) {
                    $summaryDiv
                        .empty()
                        .append(createError('Pangenome data summary error', error.error));
                });
            return $summaryDiv;
        },

        showHomologFamilies: function () {
            var self = this;
            var $homologDiv = $('<div>').append(this.loading());
            const pangenomeClient = new DynamicServiceClient({
                module: 'PanGenomeAPI',
                url: this.runtime.config('services.ServiceWizard.url'),
                token: this.runtime.service('session').getAuthToken()
            });
            pangenomeClient.callFunc('compute_summary_from_pangenome', [{
                pangenome_ref: this.objRef
            }])
                .then(function ([data]) {
                    var genomeList = Object.keys(data.genomes).sort();
                    var numGenomes = genomeList.length;
                    var numberTable = [];
                    var header = ['<th>Genome</th><th>Legend</th>'];
                    for (var i=0; i<numGenomes; i++) {
                        header.push('<th style="text-align:center"><b>G' + (i+1) + '</b></th>');
                        var singleComp = [];
                        singleComp.push('<b>G' + (i+1) + '</b> - ' + genomeList[i]);
                        singleComp.push('# homolog families');
                        for (var j=0; j<numGenomes; j++) {
                            var cell = data.shared_family_map[genomeList[i]][genomeList[j]];
                            if (i === j) {
                                cell = '<font color="#d2691e">' + cell + '</font>';
                            }
                            singleComp.push(cell);
                        }

                        numberTable.push(singleComp);
                    }

                    const $prettyTable = $('<table class="table table-hover table-striped table-bordered">');
                    $prettyTable.append($('<tr>').append(header.join()));
                    for (let i=0; i<numberTable.length; i++) {
                        $prettyTable.append(self.tableRow(numberTable[i]));
                    }
                    $homologDiv.empty().append($prettyTable);
                })
                .catch(function (error) {
                    $homologDiv
                        .empty()
                        .append(createError('Pangenome homolog family data error', error.error));
                });
            return $homologDiv;
        },

        renderTable: function (props, $el) {
            $el = $el || $('<div>');
            preact.render(preact.h(Table, props), $el[0]);
            return $el;
        },

        showProteinFamilies2: function () {
            const onIDClick = (e, id) => {
                e.preventDefault();
                this.addFamilyTab(this.dataCache[id]);
            };

            return this.renderTable({
                columns: [{
                    id: 'id',
                    title: 'Family',
                    width: '10em',
                    render: (id, row) => {
                        return html`
                            <a href="#" onClick=${(e) => {onIDClick(e, id, row);}}>
                            ${id}
                            </a>
                        `;
                    },
                    sort: {
                        type: 'alphanumeric'
                    }
                }, {
                    id: 'function',
                    title: 'Function',
                    sort: {
                        type: 'alphanumeric'
                    }
                }, {
                    id: 'proteinCodingGeneCount',
                    title: 'Protein Coding Gene Count',
                    width: '15em'
                }, {
                    id: 'genomeCount',
                    title: 'Genome Count',
                    width: '10em'
                }],
                sortColumn: null,
                sortDirection: null,
                pageSize: this.options.pFamsPerPage,
                fetchData: (query, sortColumn, sortDirection, offset, limit) => {
                    const sortBy = [];
                    if (sortColumn && sortDirection !== null) {
                        sortBy.push([ sortColumn, sortDirection]);
                    }
                    return this.searchAndCacheOrthologs(query, sortBy, offset, limit);
                },
                table: [
                ]
            });
        },

        addFamilyTab: function (fam) {
            if (this.tabs.hasTab(fam.id)) {
                this.tabs.showTab(fam.id);
            } else {
                this.tabs.addTab({
                    tab: fam.id,
                    deleteCallback: (name) => {
                        this.tabs.removeTab(name);
                        this.tabs.showTab(this.tabs.activeTab());
                    },
                    showContentCallback: () => {
                        return this.createProteinFamilyTab(fam);
                    }
                });
                this.tabs.showTab(fam.id);
            }
        },

        createProteinFamilyTab: function (fam) {
            var $div = $('<div>').append(this.loading());
            var colMap = {
                genome: 0,
                feature: 1,
                function: 2,
                len: 3
            };
            var getFamilyFunctionNames = (orthologs) => {
                // prep calls
                var genomeToGenes = {};
                orthologs.forEach(function (ortho) {
                    var genome = ortho[2];
                    var feature = ortho[0];
                    if (!genomeToGenes[genome]) {
                        genomeToGenes[genome] = [];
                    }
                    genomeToGenes[genome].push(feature);
                });
                const pangenomeClient = new DynamicServiceClient({
                    module: 'GenomeAnnotationAPI',
                    url: this.runtime.config('services.ServiceWizard.url'),
                    token: this.runtime.service('session').getAuthToken()
                });
                const promises = Object.keys(genomeToGenes).map((genome) => {
                    return pangenomeClient.callFunc('get_feature_functions', [{
                        ref: genome,
                        feature_id_list: genomeToGenes[genome]
                    }])
                        .then((names) => {
                            return Promise.try(() => {
                                return {
                                    genome: genome,
                                    features: names[0]
                                };
                            });
                        });
                });
                return Promise.all(promises).then(function (nameSets) {
                    var res = {};
                    nameSets.forEach(function (nameSet) {
                        res[nameSet.genome] = nameSet.features;
                    });
                    return res;
                });
            };

            var getFamData = (offset, limit, query, sortColId, sortDir, genomeRefMap, geneFunctionMap) => {
                query = query.toLocaleLowerCase();
                return Promise.try(() => {
                    const rows = fam.orthologs.map((ortho) => {
                        return [
                            ortho[2], // genome ref
                            genomeRefMap[ortho[2]],
                            ortho[0],
                            geneFunctionMap[ortho[2]][ortho[0]],
                            // ortho[1]
                        ];
                    })
                        .filter((row) => {
                            if (query) {
                                for (const value in row) {
                                    if (!String(value).toLocaleLowerCase().indexOf(query) !== -1) {
                                        return false;
                                    }
                                }
                            }
                            return true;
                        });

                    // now we sort and return.
                    if (sortColId && sortDir) {
                        rows.sort(function (a, b) {
                            var aVal = a[colMap[sortColId]];
                            var bVal = b[colMap[sortColId]];
                            if ($.isNumeric(aVal) && $.isNumeric(bVal)) {
                                if (sortDir > 0) {
                                    return aVal > bVal ? 1 : -1;
                                }
                                return bVal > aVal ? 1 : -1;
                            }
                            else {
                                if (sortDir > 0) {
                                    return String(aVal).localeCompare(bVal);
                                }
                                return String(bVal).localeCompare(aVal);
                            }
                        });
                    }
                    return {
                        rows: rows.slice(offset, offset + limit + 1),
                        query: query,
                        start: offset,
                        total: rows.length
                    };
                });
            };

            const pangenomeClient = new DynamicServiceClient({
                module: 'PanGenomeAPI',
                url: this.runtime.config('services.ServiceWizard.url'),
                token: this.runtime.service('session').getAuthToken()
            });
            pangenomeClient.callFunc('compute_summary_from_pangenome', [{
                pangenome_ref: this.objRef
            }])
                .then(([results]) => {
                    return getFamilyFunctionNames(fam.orthologs)
                        .then((names) => {
                            $div.empty();

                            this.renderTable({
                                columns: [{
                                    id: 'genomeRef',
                                    title: 'Genome Reference',
                                    display: false
                                }, {
                                    id: 'genome',
                                    title: 'Genome Name',
                                    isSortable: true,
                                    width: '25%',
                                    render: (genomeName, row) => {
                                        return html`
                                            <a href="/#dataview/${row[0]}" target="_blank">${genomeName}</a>
                                        `;
                                    }
                                }, {
                                    id: 'feature',
                                    title: 'Feature Id',
                                    isSortable: true,
                                    width: '25%',
                                    render: (featureId, row) => {
                                        return html`
                                            <a href="/#dataview/${row[0]}?sub=Feature&subid=${featureId}" target="_blank">${featureId}</a>
                                        `;
                                    }
                                }, {
                                    id: 'function',
                                    title: 'Function',
                                    isSortable: true,
                                    width: '50%'
                                }],
                                pageSize: this.options.pFamsPerPage,
                                fetchData: (query, sortColumn, sortDirection, offset, limit) => {
                                    // const sortBy = [];
                                    // if (sortColumnIndex && sortDirection !== 0) {
                                    //     sortBy.push([ sortColumnIndex, sortDirection === 1 ? 1 : 0 ]);
                                    // }
                                    return getFamData(offset, limit, query || '', sortColumn, sortDirection, results.genome_ref_name_map, names);
                                },
                                table: [
                                ]
                            }, $div);
                            return null;
                        });
                })
                .catch((err) => {
                    $div.html(this.buildError(err));
                });
            return $div;
        },

        buildError: function (error) {
            console.error('ERROR', error);
            return `<div><span class="alert alert-danger">ERROR: ${error.message || error.error.message}</span></div>`;
        },

        searchAndCacheOrthologs: function (query, sortBy, start, limit) {
            var self = this;
            const pangenomeClient = new DynamicServiceClient({
                module: 'PanGenomeAPI',
                url: this.runtime.config('services.ServiceWizard.url'),
                token: this.runtime.service('session').getAuthToken()
            });
            return pangenomeClient.callFunc('search_orthologs_from_pangenome', [{
                pangenome_ref: this.objRef,
                query: query,
                sort_by: sortBy,
                start: start,
                limit: limit
            }])
                .then(function ([results]) {
                    var rows = [];
                    self.dataCache = {};
                    results.orthologs.forEach(function (info) {
                        self.dataCache[info.id] = info;
                        var orthoGenomes = {};
                        info.orthologs.forEach(function (ortholog) {
                            orthoGenomes[ortholog[2]] = 1;
                        });
                        rows.push([
                            info.id,
                            info.function || '',
                            info.orthologs.length,
                            Object.keys(orthoGenomes).length
                        ]);
                    });
                    return {
                        rows: rows,
                        query: results.query,
                        start: results.start,
                        total: results.num_found
                    };
                })
                .catch(function (error) {
                    console.error(error);
                    throw error;
                });
        },

        showVennDiagram: function () {
            return $('<div>Venn Diagram</div>');
        },

        loggedInCallback: function (event, auth) {
            this.token = auth.token;
            this.render();
            return this;
        },
    });
});
