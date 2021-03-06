/**
 * Output widget for visualization of comparison between proteomes of two bacterial genomes.
 * @author Roman Sutormin <rsutormin@lbl.gov>
 * @public
 */
define([
    'jquery',
    'kb_common/html',
    'kb_service/client/workspace',
    'kb_lib/jsonRpc/dynamicServiceClient',
    'kb_lib/jsonRpc/genericClient',
    'uuid',

    // For effect
    'kbaseUI/widget/legacy/authenticatedWidget'
], function (
    $,
    html,
    Workspace,
    DynamicServiceClient,
    GenericClient,
    Uuid
) {
    'use strict';
    $.KBWidget({
        name: 'GenomeComparisonWidget',
        parent: 'kbaseAuthenticatedWidget',
        version: '1.0.0',
        ws_name: null,
        ws_id: null,
        options: {
            ws_name: null,
            ws_id: null
        },

        timer: null,
        geneRows: 21,
        geneRowH: 21,
        pref: null,
        size: 500,
        imgI: 0,
        imgJ: 0,
        imgLeftIndent: 35,
        imgBottomIndent: 15,
        scale: null,
        stepPercent: 25,
        geneI: -1,
        dirI: 1,
        geneJ: -1,
        dirJ: 1,
        cmp: null,
        cmp_ref: null,
        selectHitsMessage: 'Move mouse over hits in map and select hit to visualize region around it',
        genome1wsName: null,
        genome1objName: null,
        genome2wsName: null,
        genome2objName: null,

        init: function (options) {
            this._super(options);
            this.ws_name = options.ws_name;
            this.ws_id = options.ws_id;
            this.pref = new Uuid(4).format();
            return this;
        },

        render: function () {
            const self = this;
            const container = this.$elem;
            container.empty();
            // wsUrl: ,
            // swUrl: this.runtime.config('service.ServiceWizard.url'),
            // const kbws = new Workspace(this.runtime.config('service.workspace.url'),
            //     {token: self.authToken()});
            const kbws = new GenericClient({
                url: this.runtime.config('services.workspace.url'),
                module: 'Workspace',
                token: this.runtime.service('session').getAuthToken()
            });
            const gaapi = new DynamicServiceClient({
                url: this.runtime.config('services.service_wizard.url'),
                module: 'GenomeAnnotationAPI',
                token: this.runtime.service('session').getAuthToken()
            });
            // const gaapi = new GenomeAnnotationAPI(this.swUrl, {'token':self.authToken()});

            const dataIsReady = function () {
                let cmp_ref = self.cmp_ref;
                if (!cmp_ref) {
                    cmp_ref = self.ws_name + '/' + self.ws_id;
                }
                kbws.callFunc('get_objects', [
                    [{ref: cmp_ref}]
                ])
                    .then(([data]) => {
                        self.cmp = data[0].data;
                        var info = data[0].info;
                        self.cmp_ref = info[6] + '/' + info[0] + '/' + info[4];
                        return cmpIsLoaded();
                    })
                    .catch((err) => {
                        const tdElem = $('#'+self.pref+'job');
                        tdElem.html('Error accessing comparison object: ' + err.message || err.error.message);
                    });
            };
            const cmpIsLoaded = function () {
                container.empty();
                container.append(html.loading('loading comparison data...'));
                return gaapi.callFunc('get_genome_v1', [{
                    genomes: [{ref: self.cmp.genome1ref}, {ref: self.cmp.genome2ref}],
                    included_fields: ['scientific_name']
                }])
                    .then(([data]) => {
                        const genomes = data.genomes;
                        const [genome1, genome2] = genomes;
                        self.genome1Ref = [genome1.info[0], genome1.info[6], genome1.info[4]].join('/');
                        self.genome1wsName = genomes[0].info[7];
                        self.genome1objName = genomes[0].info[1];
                        const genome1id = genomes[0].data.scientific_name;
                        self.genome2Ref = [genome2.info[0], genome2.info[6], genome2.info[4]].join('/');
                        self.genome2wsName = genomes[1].info[7];
                        self.genome2objName = genomes[1].info[1];
                        const genome2id = genomes[1].data.scientific_name;
                        container.empty();
                        const $nc = $('#root');
                        $nc.append(`<div id="widget-tooltip_${self.pref}" class="dataview-tooltip">Test message</div>`);
                        const table = $('<table/>')
                            .addClass('table table-bordered')
                            .css({'margin-left': 'auto', 'margin-right': 'auto'});
                        container.append(table);
                        const createTableRow = function (name, value) {
                            return '<tr><td>' + name + '</td><td>' + value + '</td></tr>';
                        };
                        let count1hits = 0;
                        for (var i in self.cmp.data1) {
                            if (self.cmp.data1[i].length > 0)
                                count1hits++;
                        }
                        let count2hits = 0;
                        for (const i in self.cmp.data2) {
                            if (self.cmp.data2[i].length > 0)
                                count2hits++;
                        }
                        table.append(createTableRow('Comparison object', self.ws_id));
                        table.append(createTableRow('Genome1 (x-axis)', '<a href="/#dataview/'+self.genome1Ref+'" target="_blank">' + genome1id + '</a>' +
                        ' (' + self.cmp.proteome1names.length + ' genes, ' + count1hits + ' have hits)'));
                        table.append(createTableRow('Genome2 (y-axis)', '<a href="/#dataview/'+self.genome2Ref+'" target="_blank">' + genome2id + '</a>' +
                        ' (' + self.cmp.proteome2names.length + ' genes, ' + count2hits + ' have hits)'));
                        if (self.scale == null)
                            self.scale = self.size * 100 / Math.max(self.cmp.proteome1names.length, self.cmp.proteome2names.length);
                        const st = ' style="border: 0px; margin: 0px; padding: 0px;"';
                        const sr = ' style="border: 0px; margin: 0px; padding: 0px;"';
                        const sd = ' style="border: 0px; margin: 0px; padding: 1px;"';
                        const sb = ' style="width: 27px;"';

                        table.append('<tr><td>' +
                            '<center>' +
                            '<button id="'+self.pref+'btn-zi">Zoom +</button>'+
                            '&nbsp;' +
                            '<button id="'+self.pref+'btn-zo">Zoom -</button>'+
                            '<br><br><table'+st+'><tr'+sr+'><td'+sd+'>' +
                            '<button id="'+self.pref+'btn-mul"'+sb+'>&#8598;</button>'+
                            '</td><td'+sd+'>' +
                            '<button id="'+self.pref+'btn-mu"'+sb+'>&#8593;</button>'+
                            '</td><td'+sd+'>' +
                            '<button id="'+self.pref+'btn-mur"'+sb+'>&#8599;</button>'+
                            '</td></tr><tr'+sr+'><td'+sd+'>' +
                            '<button id="'+self.pref+'btn-ml"'+sb+'>&#8592;</button>'+
                            '</td><td'+sd+'/><td'+sd+'>' +
                            '<button id="'+self.pref+'btn-mr"'+sb+'>&#8594;</button>'+
                            '</td></tr><tr'+sr+'><td'+sd+'>' +
                            '<button id="'+self.pref+'btn-mdl"'+sb+'>&#8601;</button>'+
                            '</td><td'+sd+'>' +
                            '<button id="'+self.pref+'btn-md"'+sb+'>&#8595;</button>'+
                            '</td><td'+sd+'>' +
                            '<button id="'+self.pref+'btn-mdr"'+sb+'>&#8600;</button>'+
                            '</td></tr></table></center>' +
                            '</td><td><div style="float:left;width:'+(self.size+40)+'px;max-width:'+(self.size+40)+'px">'+
                            '<div id="'+self.pref+'_img"/>'+
                            '</div>'+
                            '<div style="float:left;width:300px;max-width:300px"><table id="'+self.pref+'genes"'+st+'><tr'+st+'><td'+st+'>'+self.selectHitsMessage+'</td></tr></table></div></td></tr>');
                        try {
                            self.refreshImage();
                        } catch (ex) {
                            console.error('ERROR!', ex);
                            throw new Error('Error refreshing image: ' + ex.message);
                        }
                        self.refreshGenes();
                        const zoom = function (mult) {
                            const xSize = Math.min(self.size, self.cmp.proteome1names.length * self.scale / 100);
                            const ySize = Math.min(self.size, self.cmp.proteome2names.length * self.scale / 100);
                            const centerI = self.imgI + xSize * 50 / self.scale;
                            const centerJ = self.imgJ + ySize * 50 / self.scale;
                            if (self.size * 100 / (self.scale * mult) > 1.1 *
                            Math.max(self.cmp.proteome1names.length, self.cmp.proteome2names.length)) {
                                return;
                            }
                            self.scale *= mult;
                            self.imgI = centerI - self.size * 50 / self.scale;
                            self.imgJ = centerJ - self.size * 50 / self.scale;
                            self.refreshImage();
                        };

                        $('#'+self.pref+'btn-zi').click(function () {
                            zoom(1.5);
                        });
                        $('#'+self.pref+'btn-zo').click(function () {
                            zoom(1.0/1.5);
                        });
                        const move = function (yUp,xRt) {
                            self.imgJ += yUp * self.size * self.stepPercent / self.scale;
                            self.imgI += xRt * self.size * self.stepPercent / self.scale;
                            self.refreshImage();
                        };
                        $('#'+self.pref+'btn-mul').click(function () {
                            move(1,-1);
                        });
                        $('#'+self.pref+'btn-mu').click(function () {
                            move(1,0);
                        });
                        $('#'+self.pref+'btn-mur').click(function () {
                            move(1,1);
                        });
                        $('#'+self.pref+'btn-ml').click(function () {
                            move(0,-1);
                        });
                        $('#'+self.pref+'btn-mr').click(function () {
                            move(0,1);
                        });
                        $('#'+self.pref+'btn-mdl').click(function () {
                            move(-1,-1);
                        });
                        $('#'+self.pref+'btn-md').click(function () {
                            move(-1,0);
                        });
                        $('#'+self.pref+'btn-mdr').click(function () {
                            move(-1,1);
                        });

                        const hitSearch = function (e) {
                            let scrX = e.pageX;
                            let scrY = e.pageY;
                            if ((!scrX) && (!scrY) && e.clientX && e.clientY) {
                                scrX = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
                                scrY = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
                            }
                            const $elem = $('#'+self.pref+'_img');
                            const $nc = $('#root');
                            const ncPos = $nc.position();
                            const elemScrRect = $elem[0].getBoundingClientRect();
                            const relX = scrX - elemScrRect.left - self.imgLeftIndent;
                            const relY = scrY - elemScrRect.top;
                            const docX = scrX - ncPos.left + $nc.scrollLeft();
                            const docY = scrY - ncPos.top + $nc.scrollTop();
                            const xSize = Math.min(self.size, self.cmp.proteome1names.length * self.scale / 100);
                            const ySize = Math.min(self.size, self.cmp.proteome2names.length * self.scale / 100);
                            let bestDist = -1;
                            let bestI = -1;
                            let bestJ = -1;
                            if (relX >= 0 && relX <= xSize && relY >= 0 && relY <= ySize) {
                                for (const key1 in self.cmp.data1) {
                                    const i = Number(key1);
                                    const x = (i - self.imgI) * self.scale / 100;
                                    if (x >= 0 && x < xSize && Math.abs(relX - x) <= 2) {
                                        for (const tuplePos in self.cmp.data1[i]) {
                                            const tuple = self.cmp.data1[i][tuplePos];
                                            const j = tuple[0];
                                            const y = ySize + 1 - (j - self.imgJ) * self.scale / 100;
                                            if (y >= 0 && y < ySize && Math.abs(relY - y) <= 2) {
                                                var dist = Math.sqrt((relX - x) * (relX - x) + (relY - y) * (relY - y));
                                                if (bestDist < 0 || bestDist > dist) {
                                                    bestDist = dist;
                                                    bestI = i;
                                                    bestJ = j;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            return {
                                scrX: docX,
                                scrY: docY,
                                relX: relX,
                                relY: relY,
                                bestDist: bestDist,
                                bestI: bestI,
                                bestJ: bestJ
                            };
                        };

                        $('#'+self.pref+'_img')
                            .hover(
                                function () {
                                    $('#widget-tooltip_'+self.pref).show();
                                },
                                function () {
                                    $('#widget-tooltip_'+self.pref).hide();
                                }
                            )
                            .mousemove(function (e) {
                                const hit = hitSearch(e);
                                const tip = $('#widget-tooltip_' + self.pref);
                                if (Number(hit.bestDist) >= 0) {
                                    const msg = 'X-axis: ' + self.cmp.proteome1names[Number(hit.bestI)] +
                            ', Y-axis: ' + self.cmp.proteome2names[Number(hit.bestJ)] +
                            '<br>click to see details...';
                                    tip.html(msg);
                                    tip.css({
                                        'top': (Number(hit.scrY) + 10) + 'px',
                                        'left': (Number(hit.scrX) + 10) + 'px'
                                    });
                                    tip.show();
                                    return;
                                }
                                tip.hide();
                                tip.html('');
                            })
                            .click(function (e) {
                                var hit = hitSearch(e);
                                if (Number(hit.bestDist) >= 0) {
                                    self.geneI = Number(hit.bestI);
                                    self.geneJ = Number(hit.bestJ);
                                } else {
                                    self.geneI = -1;
                                    self.geneJ = -1;
                                }
                                self.refreshGenes();
                            });
                        return null;
                    })
                    .catch((data) => {
                        const tdElem = $('#'+self.pref+'job');
                        tdElem.html('Error accessing genome objects: ' + data.error.message);
                    });
            };
            dataIsReady();
            return this;
        },

        refreshDetailedRect: function () {
            this.refreshImage();
        },

        refreshImage: function () {
            var self = this;
            var maxI = self.imgI + self.size * 100 / self.scale;
            if (maxI > self.cmp.proteome1names.length)
                maxI = self.cmp.proteome1names.length;
            var maxJ = self.imgJ + self.size * 100 / self.scale;
            if (maxJ > self.cmp.proteome2names.length)
                maxJ = self.cmp.proteome2names.length;
            self.imgI = maxI - self.size * 100 / self.scale;
            self.imgJ = maxJ - self.size * 100 / self.scale;
            if (self.imgI < 0)
                self.imgI = 0;
            if (self.imgJ < 0)
                self.imgJ = 0;
            self.imgI = Math.round(self.imgI);
            self.imgJ = Math.round(self.imgJ);
            var $svg = $('#'+self.pref+'_img');

            var i0 = self.imgI;
            var j0 = self.imgJ;
            var w0 = self.size;
            var h0 = self.size;
            var sp = self.scale;
            var xShift = self.imgLeftIndent;
            var yShift = self.imgBottomIndent;
            var w = w0 + xShift;
            var h = h0 + yShift;
            var svg = '<svg id="'+self.pref+'svg" style="width:'+w+'px;height:'+h+'px;background-color:white" '+
            'viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMinYMin meet">';
            var isFirefox = typeof InstallTrigger !== 'undefined';
            var imax = self.cmp.proteome1names.length;
            if ((imax - 1 - i0) * sp / 100.0 > w0)
                imax = Math.min(self.cmp.proteome1names.length, Math.round(w0 * 100.0 / sp) + i0 + 1);
            var xmax = Math.min(w0, Math.round((imax - i0 - 1) * sp / 100.0) + 1);
            var jmax = self.cmp.proteome2names.length;
            if ((jmax - 1 - j0) * sp / 100.0 > h0)
                jmax = Math.min(self.cmp.proteome2names.length, Math.round(h0 * 100.0 / sp) + j0 + 1);
            var ymax = Math.min(h0, Math.round((jmax - j0 - 1) * sp / 100.0) + 1);
            var fieldX = xShift;
            var fieldY = 0;
            if (isFirefox) {
                fieldX += 0.5;
                fieldY += 0.5;
            }
            svg += '<rect x="'+fieldX+'" y="'+fieldY+'" width="'+xmax+'" height="'+ymax+'" style="fill:rgb(0,75,75)"/>';
            for (var i = i0; i < imax; i++) {
                var x = xShift + Math.round((i - i0) * sp / 100.0);
                var hitList = self.cmp.data1[i];
                for (var hitPos in hitList) {
                    var hit = hitList[hitPos];
                    var j = hit[0];
                    if (j < j0 || j >= jmax)
                        continue;
                    var y = ymax - 1 - Math.round((j - j0) * sp / 100.0);
                    var bbhPercent = hit[2];
                    var gbPart = Math.min(255, Math.max(0, Math.round(255.0 * (bbhPercent - 90.0) / 10.0)));
                    var greenPart = 255 - Math.round((255 - gbPart) / 2);
                    var bluePart = gbPart;
                    if (isFirefox) {
                        x += 0.5;
                        y += 0.5;
                    }
                    svg += '<rect x="'+x+'" y="'+y+'" width="1" height="1" style="fill:rgb(255,'+greenPart+','+bluePart+')"/>';
                }
            }
            svg += '<text x="'+xShift+'" y="'+(ymax-5)+'" fill="black" text-anchor="end" font-family="monospace" font-size="12">' + (j0 + 1) + '</text>';
            svg += '<text x="'+xShift+'" y="'+12+'" fill="black" text-anchor="end" font-family="monospace" font-size="12">' + jmax + '</text>';
            svg += '<text x="'+xShift+'" y="'+(ymax+10)+'" fill="black" font-family="monospace" font-size="12">' + (i0 + 1) + '</text>';
            svg += '<text x="'+(xmax+xShift-1)+'" y="'+(ymax+10)+'" fill="black" text-anchor="end" font-family="monospace" font-size="12">' + imax + '</text>';
            if (self.geneI >= 0 && self.geneJ >= 0) {
                const x = (self.geneI - self.imgI) * self.scale / 100;
                const y = (self.geneJ - self.imgJ) * self.scale / 100;
                if (x >= 0 && x < self.size && y >= 0 && y < self.size) {
                    var half = Math.round(self.geneRows * self.scale / 200);
                    if (half < 1)
                        half = 1;
                    var ySize = Math.min(self.size, self.cmp.proteome2names.length * self.scale / 100);
                    var rX = Math.round(x + xShift - half - 1);
                    var rY = Math.round(ySize + 1 - y - half - 1);
                    if (isFirefox) {
                        rX += 0.5;
                        rY += 0.5;
                    }
                    var rS = 1 + half * 2;
                    var rX2 = rX + rS - 1;
                    var rY2 = rY + rS - 1;
                    svg += '<rect x="'+rX+'" y="'+rY+'" width="'+rS+'" height="1" style="fill:red"/>';
                    svg += '<rect x="'+rX+'" y="'+rY+'" width="1" height="'+rS+'" style="fill:red;"/>';
                    svg += '<rect x="'+rX2+'" y="'+rY+'" width="1" height="'+rS+'" style="fill:red;"/>';
                    svg += '<rect x="'+rX+'" y="'+rY2+'" width="'+rS+'" height="1" style="fill:red;"/>';
                }
            }
            svg += '</svg>';
            $svg.empty();
            $svg.append($(svg));
        },

        refreshGenes: function () {
            var self = this;
            var tbl = $('#'+self.pref+'genes');
            tbl.empty();
            var st = ' style="border: 0px; margin: 0px; padding: 0px;"';
            if (self.geneI < 0 || self.geneJ < 0) {
                self.refreshDetailedRect();
                tbl.append('<tr'+st+'><td'+st+'>' + self.selectHitsMessage + '</td></tr>');
                return;
            }
            const half = Math.floor(self.geneRows / 2);
            const rowHalf = Math.floor(self.geneRowH / 2);
            // var svg = null;
            let arrowI = '&#8595;';
            let arrowJ = '&#8595;';
            if (self.dirI < 0)
                arrowI = '&#8593;';
            if (self.dirJ < 0)
                arrowJ = '&#8593;';
            const sr = ' style="border: 0px; margin: 0px; padding: 0px;"';
            // const sd = ' style="border: 0px; margin: 0px; padding: 1px;"';
            const sb = ' style="width: 27px;"';
            tbl.append('<tr'+sr+'>'+
                '<td rowspan="'+(self.geneRows+2)+'" width="10" style="border: 0px; margin: 0px; padding: 0px; text-align: center; vertical-align: middle;"><button id="'+self.pref+'btn-dirI"'+sb+'>'+arrowI+'</button></td>'+
                '<td style="border: 0px; margin: 0px; padding: 0px; text-align: center; vertical-align: middle;"><button id="'+self.pref+'btn-i-up"'+sb+'>&#8593;</button></td>'+
                '<td style="border: 0px; margin: 0px; padding: 0px; text-align: center; vertical-align: middle;"><button id="'+self.pref+'btn-both-up"'+sb+'>&#8593;&#8593;</button></td>'+
                '<td style="border: 0px; margin: 0px; padding: 0px; text-align: center; vertical-align: middle;"><button id="'+self.pref+'btn-j-up"'+sb+'>&#8593;</button></td>'+
                '<td rowspan="'+(self.geneRows+2)+'" width="10" style="border: 0px; margin: 0px; padding: 0px; text-align: center; vertical-align: middle;"><button id="'+self.pref+'btn-dirJ"'+sb+'>'+arrowJ+'</button></td>'+
                '</tr>');
            let svgLines = '';
            const svgLineEnds = []; // [{x1:...,y1:...,x2:...,y2:...,gene1:...,gene2:...,bit_score:...,percent_of_bbh:...}]
            for (let rowPos = 0; rowPos < self.geneRows; rowPos++) {
                const i = self.geneI + (rowPos - half) * self.dirI;
                const j = self.geneJ + (rowPos - half) * self.dirJ;
                let labelI = '-';
                let labelJ = '-';
                if (i >= 0 && i < self.cmp.proteome1names.length)
                    labelI = self.cmp.proteome1names[i];
                if (j >= 0 && j < self.cmp.proteome2names.length)
                    labelJ = self.cmp.proteome2names[j];
                if (rowPos == half) {
                    labelI = '<font color="red">' + labelI + '</font>';
                    labelJ = '<font color="red">' + labelJ + '</font>';
                }
                const tdSt = ' style="border: 0px; margin: 0px; padding: 0px; font-size: 12px; height: '+self.geneRowH+'px; text-align: center; vertical-align: middle;"';
                let tds = '<td '+tdSt+'>' + '<a href="/#dataview/'+self.genome1Ref+'?sub=Feature&subid='+self.cmp.proteome1names[i]+'" target="_blank">' + labelI + '</a>' + '</td>';
                if (rowPos == 0)
                    tds += '<td id="'+self.pref+'glinks" rowspan="'+self.geneRows+'" width="30"'+sr+'/>';
                tds += '<td '+tdSt+'>' + '<a href="/#dataview/'+self.genome2Ref+'?sub=Feature&subid='+self.cmp.proteome2names[j]+'" target="_blank">' + labelJ + '</a>' + '</td>';
                tbl.append('<tr'+sr+'>'+tds+'</tr>');
                var y1 = rowPos * (self.geneRowH + 0.2) + rowHalf;
                for (var tuplePos in self.cmp.data1[i]) {
                    const tuple = self.cmp.data1[i][tuplePos];
                    const hitJ = tuple[0];
                    const hitPos = (hitJ - self.geneJ) * self.dirJ + half;
                    if (hitPos >= 0 && hitPos < self.geneRows) {
                        var y2 = hitPos * (self.geneRowH + 0.2) + rowHalf;
                        var dash = '';
                        if (tuple[2] < 100)
                            dash = ' stroke-dasharray="5, 5"';
                        svgLines += '<line x1="0" y1="'+y1+'" x2="30" y2="'+y2+'"'+dash+' style="stroke:rgb(0,0,0);stroke-width:1"/>';
                        svgLineEnds.push({x1:0,y1:y1,x2:30,y2:y2,gene1:self.cmp.proteome1names[i],gene2:self.cmp.proteome2names[hitJ],bit_score:tuple[1],percent_of_bbh:tuple[2]});
                    }
                }
            }
            tbl.append('<tr'+sr+'>'+
                '<td style="border: 0px; margin: 0px; padding: 0px; text-align: center; vertical-align: middle;"><button id="'+self.pref+'btn-i-dn"'+sb+'>&#8595;</button></td>'+
                '<td style="border: 0px; margin: 0px; padding: 0px; text-align: center; vertical-align: middle;"><button id="'+self.pref+'btn-both-dn"'+sb+'>&#8595;&#8595;</button></td>'+
                '<td style="border: 0px; margin: 0px; padding: 0px; text-align: center; vertical-align: middle;"><button id="'+self.pref+'btn-j-dn"'+sb+'>&#8595;</button></td>'+
                '</tr>');
            var svgTd = $('#'+self.pref+'glinks');
            var svgH = self.geneRows * self.geneRowH;
            svgTd.append('<svg width="30" height="'+svgH+'">'+svgLines+'</svg>');
            svgTd
                .hover(
                    function () {
                        $('#widget-tooltip_'+self.pref).show();
                    },
                    function () {
                        $('#widget-tooltip_'+self.pref).hide();
                    }
                )
                .mousemove(function (e) {
                    var scrX = e.pageX;
                    var scrY = e.pageY;
                    if ((!scrX) && (!scrY) && e.clientX && e.clientY) {
                        scrX = e.clientX + document.body.scrollLeft
                    + document.documentElement.scrollLeft;
                        scrY = e.clientY + document.body.scrollTop
                    + document.documentElement.scrollTop;
                    }
                    var $elem = svgTd;
                    var $nc = $('#root');
                    var ncPos = $nc.position();

                    var docX = scrX - ncPos.left + $nc.scrollLeft();
                    var docY = scrY - ncPos.top + $nc.scrollTop();
                    var elemScrRect = $elem[0].getBoundingClientRect();
                    var x = scrX - elemScrRect.left;
                    var y = scrY - elemScrRect.top;
                    var minDist = -1;
                    var bestLine = null;
                    for (var n in svgLineEnds) {
                        var l = svgLineEnds[n];
                        // [{x1:...,y1:...,x2:...,y2:...,gene1:...,gene2:...,bit_score:...,percent_of_bbh:...}]
                        var dist = Math.abs((l.y2-l.y1)*x-(l.x2-l.x1)*y+l.x2*l.y1-l.y2*l.x1) /
                        Math.sqrt((l.y2-l.y1)*(l.y2-l.y1)+(l.x2-l.x1)*(l.x2-l.x1));
                        if ((minDist < 0) || (dist < minDist)) {
                            minDist = dist;
                            bestLine = l;
                        }
                    }
                    var tip = $('#widget-tooltip_'+self.pref);
                    if (minDist && minDist <= 2) {
                        var msg = 'Gene1: ' + bestLine.gene1 + '<br>Gene2: ' + bestLine.gene2 + '<br>' +
                        'Bit-score: ' + bestLine.bit_score + '<br>Percent of related BBH bit-score: ' + bestLine.percent_of_bbh + '%';
                        tip.html(msg);
                        tip.css({
                            'top': (Number(docY) + 10) + 'px',
                            'left': (Number(docX) + 10) + 'px'
                        });
                        tip.show();
                        return;
                    }
                    tip.hide();
                    tip.html('');
                });
            $('#'+self.pref+'btn-dirI').click(function () {
                self.dirI *= -1;
                self.refreshGenes();
            });
            $('#'+self.pref+'btn-i-up').click(function () {
                self.geneI -= self.dirI;
                self.refreshGenes();
            });
            $('#'+self.pref+'btn-both-up').click(function () {
                self.geneI -= self.dirI;
                self.geneJ -= self.dirJ;
                self.refreshGenes();
            });
            $('#'+self.pref+'btn-j-up').click(function () {
                self.geneJ -= self.dirJ;
                self.refreshGenes();
            });
            $('#'+self.pref+'btn-dirJ').click(function () {
                self.dirJ *= -1;
                self.refreshGenes();
            });
            $('#'+self.pref+'btn-i-dn').click(function () {
                self.geneI += self.dirI;
                self.refreshGenes();
            });
            $('#'+self.pref+'btn-both-dn').click(function () {
                self.geneI += self.dirI;
                self.geneJ += self.dirJ;
                self.refreshGenes();
            });
            $('#'+self.pref+'btn-j-dn').click(function () {
                self.geneJ += self.dirJ;
                self.refreshGenes();
            });
            self.refreshDetailedRect();
        },

        loggedInCallback: function () {
            //this.token = auth.token;
            this.render();
            return this;
        },

        loggedOutCallback: function () {
            //this.token = null;
            this.render();
            return this;
        },

        getState: function () {
            var self = this;
            if (self.scale == null)
                self.scale = self.size * 100 / Math.max(self.cmp.proteome1names.length, self.cmp.proteome2names.length);
            var state = {
                imgI: self.imgI,
                imgJ: self.imgJ,
                scale: self.scale,
                geneI: self.geneI,
                dirI: self.dirI,
                geneJ: self.geneJ,
                dirJ: self.dirJ,
                cmp_ref: self.cmp_ref
            };
            return state;
        },

        loadState: function (state) {
            if (!state)
                return;
            var self = this;
            self.imgI = state.imgI;
            self.imgJ = state.imgJ;
            self.scale = state.scale;
            self.geneI = state.geneI;
            self.dirI = state.dirI;
            self.geneJ = state.geneJ;
            self.dirJ = state.dirJ;
            self.cmp_ref = state.cmp_ref;
            if (!self.cmp) {
                self.render();
            } else {
                if (self.scale == null)
                    self.scale = self.size * 100 / Math.max(self.cmp.proteome1names.length, self.cmp.proteome2names.length);
                self.refreshImage();
                self.refreshGenes();
            }
        },
    });
});
