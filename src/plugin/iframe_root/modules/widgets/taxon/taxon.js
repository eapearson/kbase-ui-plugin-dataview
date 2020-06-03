define([
    'bluebird',
    'jquery',
    'underscore',
    'kb_lib/html',
    'kb_lib/htmlBuilders',
    'kb_lib/htmlBootstrapBuilders',
    'kb_lib/jsonRpc/dynamicServiceClient',
    'datatables',
    'datatables_bootstrap'
], function (Promise, $, _, html, htmlBuilders, BS, DynamicServiceClient) {
    'use strict';

    function getRef(params) {
        if (params.ref) {
            return params.ref;
        }
        if (params.workspaceId) {
            if (!params.objectId) {
                throw new Error('Object id required if workspaceId supplied');
            }
            var ref = [params.workspaceId, params.objectId];
            if (params.objectVersion) {
                ref.push(params.objectVersion);
            }
            return ref.join('/');
        }
        throw new Error(
            'Either a ref property or workspaceId, objectId, and optionally objectVersion required to make a ref'
        );
    }

    //http://localhost:8080/#dataview/1779/1006539/1
    function factory(config) {
        var parent,
            container,
            runtime = config.runtime,
            div = html.tag('div'),
            templates = {
                overview:
                    '<div class="row">' +
                    '    <div class="col-md-6">' +
                    '        <table class="table table-bordered">' +
                    '            <tr><td><b>NCBI taxonomic ID</b></td><td data-element="ncbi-id"></td></tr>' +
                    '            <tr><td><b>Scientific name</b></td><td data-element="scientific-name"></td></tr>' +
                    /* KINGDOM IS ALWAYS MISSING IN DATA!! + "            <tr><td><b>Kingdom</b></td><td data-element='kingdom'></td></tr>" */
                    '            <tr><td><b>Domain</b></td><td data-element="domain"></td></tr>' +
                    '            <tr><td><b>Genetic Code</b></td><td data-element="genetic-code"></td></tr>' +
                    '        </table>' +
                    '        <div>' +
                    '            <div><span><b>Aliases</b></span></div>' +
                    '            <div data-element="aliases"></div>' +
                    '        </div>' +
                    '    </div>' +
                    '    <div class="col-md-6" data-element="lineage">' +
                    '    </div>' +
                    '</div>',
                additionalInfo:
                    '<div class="row">' +
                    '    <div class="media col-md-12">' +
                    '        <div class="media-body">' +
                    '            <h4 class="media-heading" data-element="wiki_url"></h4>' +
                    '            <div data-element="wikipedia_text"></div>' +
                    '        </div>' +
                    '        <div class="media-right media-middle">' +
                    '            <div data-element="wikipedia_image"></div>' +
                    '        </div>' +
                    '    </div>' +
                    '</div>'
            };

        // VIEW

        function layout() {
            return div([
                BS.buildPanel({
                    type: 'default',
                    title: 'Summary',
                    body: div({ id: 'overview' }, templates.overview)
                }),
                BS.buildPanel({
                    type: 'default',
                    title: 'Children Taxons',
                    body: div({ id: 'taxonChildren' }, htmlBuilders.loading())
                }),
                BS.buildPanel({
                    type: 'default',
                    title: 'Additional Information for this Taxon',
                    body: div({ id: 'moreTaxonInfo' }, templates.additionalInfo)
                })
            ]);
        }

        function setDataElementHTML(element, value) {
            try {
                container.querySelector('[data-element="' + element + '"]').innerHTML = value;
            } catch (err) {
                console.error('while setting data element "' + element + '":', err);
                throw err;
            }
        }

        function renderLineage(decorated_lineage, my_scientific_name) {
            var list_o_links = [],
                i,
                len = decorated_lineage.length;

            for (i = 0; i < len; i += 1) {
                list_o_links.push(
                    '<div style="padding-left: ' +
                        String(i * 10) +
                        'px">' +
                        '<a href="/#dataview/' +
                        decorated_lineage[i]['ref'] +
                        '" target="_parent">' +
                        decorated_lineage[i]['scientific_name'] +
                        '</a></div>'
                );
            }
            list_o_links.push('<div style="padding-left: ' + String(len * 10) + 'px">' + my_scientific_name + '</div>');

            setDataElementHTML('lineage', div([div('<h5><strong>Lineage</strong></h5>'), div(list_o_links)]));
        }

        function renderAliases(aliases) {
            var alias_divs = [],
                i,
                len = aliases.length;

            for (i = 0; i < len; i += 1) {
                alias_divs.push('<div class="col-sm-offset-1">' + aliases[i] + '</div>');
            }
            if (len > 0) {
                setDataElementHTML('aliases', alias_divs.join(''));
            } else {
                setDataElementHTML('aliases', 'None');
            }
        }

        function renderChildren(decorated_children) {
            var list_o_links = [],
                i,
                len = decorated_children.length,
                sorted_children = decorated_children.sort(function (a, b) {
                    return a['scientific_name'].toLowerCase() > b['scientific_name'].toLowerCase();
                });

            for (i = 0; i < len; i += 1) {
                list_o_links.push(
                    '<div><a href="/#dataview/' +
                        sorted_children[i]['ref'] +
                        '" target="_parent">' +
                        sorted_children[i]['scientific_name'] +
                        '</a></div>'
                );
            }

            if (len > 0) {
                container.querySelector('div[id="taxonChildren"]').innerHTML = div(list_o_links);
            } else {
                container.querySelector('div[id="taxonChildren"]').innerHTML = div('None');
            }
        }

        function renderNCBILink(taxid) {
            setDataElementHTML(
                'ncbi-id',
                '<a target="_blank" href="http://www.ncbi.nlm.nih.gov/Taxonomy/' +
                    'Browser/wwwtax.cgi?mode=info&id=' +
                    taxid +
                    '">' +
                    taxid +
                    '</a>'
            );
        }

        function renderWikipediaEntry(wikiInfo) {
            if (wikiInfo === null || wikiInfo.link === undefined) {
                setDataElementHTML('wiki_url', 'No Wikipedia entry found for this Taxon');
            } else {
                setDataElementHTML(
                    'wiki_url',
                    '<a target="_blank" href="' + wikiInfo.link + '">Wikipedia entry for this Taxon</a>'
                );
            }

            if (wikiInfo === null || wikiInfo.extract === undefined) {
                setDataElementHTML('wikipedia_text', 'No text found');
            } else {
                setDataElementHTML('wikipedia_text', wikiInfo.extract);
            }
        }

        function renderWikipediaImage(imageURL) {
            if (imageURL === null) {
                setDataElementHTML('wikipedia_image', 'No image found');
            } else {
                setDataElementHTML('wikipedia_image', '<img class="media-object" src="' + imageURL + '"></img>');
            }
        }

        /**
         * Return copy of string with rightmost space-separated token removed.
         *
         * @param s
         */
        function removeLastToken(s) {
            if (s == '') {
                return '';
            }
            var a = s.split(' ');
            if (a.length <= 1) {
                return '';
            }
            return _.initial(a).join(' ');
        }

        // WIDGET API

        function attach(node) {
            parent = node;
            container = parent.appendChild(document.createElement('div'));
            container.innerHTML = layout();
        }

        function start(params) {
            /* Need to create the taxon client object here because it requires params.
             * The params is determined by the dataview route, which makes
             * available:
             *   workspaceId
             *   objectId
             *   objectVersion
             *   ...
             */

            var taxon_ref = getRef(params),
                wikiInfo;

            // Array.from(container.querySelectorAll('[data-element]')).forEach(function (e) {
            //     e.innerHTML = htmlBuilders.loading();
            // });

            var wiki_api_url = 'https://en.wikipedia.org/w/api.php';

            /**
             * Get text and image from wikipedia.
             *
             * Calls: fetchWikipediaData, fetchWikipediaImage
             *
             * @param name Scientific name
             * @returns {*}
             */
            function fetchWikipediaEntry(name) {
                //console.debug('fetchWikipediaEntry name="' + name + '"');
                return fetchWikipediaData(name)
                    .then(function (data) {
                        return fetchWikipediaImage(data);
                    })
                    .catch(function (err) {
                        console.error('while fetching wikipedia entry for "' + name + '":', err);
                        return false;
                    });
            }

            function encodeQuery(query) {
                return Object.keys(query)
                    .map(function (key) {
                        return [key, query[key]].map(encodeURIComponent).join('=');
                    })
                    .join('&');
            }

            /**
             * Look for the organism in wikipedia, and fetch the JSON
             * version of the basic information.
             *
             * @param name
             * @returns {*}
             */
            function fetchWikipediaData(name) {
                var query = {
                    action: 'query',
                    list: 'search',
                    format: 'json',
                    srwhat: 'text',
                    srsearch: name
                };
                var wiki_request_url = wiki_api_url + '?' + encodeQuery(query);

                return Promise.resolve(
                    $.ajax({
                        url: wiki_request_url,
                        // data: { format: 'json' },
                        dataType: 'jsonp'
                    })
                ).then(function (data) {
                    // If nothing was found, try stripping the last token and
                    // re-issuing the query.
                    if (data.query.search.length == 0) {
                        var name2 = removeLastToken(name);
                        //console.debug('Stripped scientific name "' + name + '" down to "' + name2 + '"');
                        if (name2 == '') {
                            throw new Error('No page found on Wikipedia for "' + name2 + '"');
                        }
                        data = fetchWikipediaData(name2);
                    }
                    return data;
                });
            }

            /**
             * Get wikipedia image info and add to the base wikipedia info.
             *
             * @param data Result object from fetchWikipediaData()
             * @returns {object} Object with properties 'extract', 'image', and 'link'
             */
            function fetchWikipediaImage(data) {
                var query = data.query,
                    title = query.search[0].title,
                    queryParams = {
                        action: 'query',
                        prop: 'extracts|pageimages|imageinfo|images|info|pageimages|pageprops',
                        format: 'json',
                        exlimit: '1',
                        exintro: '',
                        piprop: 'name',
                        inprop: 'url',
                        indexpageids: '',
                        titles: title
                    },
                    wiki_request_url = wiki_api_url + '?' + encodeQuery(queryParams);

                return Promise.resolve(
                    $.ajax({
                        url: wiki_request_url,
                        dataType: 'jsonp'
                    }).then(function (data) {
                        //console.debug('Images callback, data:', data);
                        var pageid = data.query.pageids[0];
                        return {
                            extract: data.query.pages[pageid].extract,
                            image: data.query.pages[pageid].pageimage,
                            link: data.query.pages[pageid].fullurl
                        };
                    })
                ).catch(function (err) {
                    if (err.status === 404) {
                        // do nothing
                    } else {
                        console.error('Error while fetching wikipedia image at "' + wiki_request_url + '":', err);
                    }
                    return {
                        extract: undefined,
                        image: undefined,
                        link: undefined
                    };
                });
            }

            /**
             * Get image data from Wikipedia
             *
             * @param name The canonical name for the page.
             * @returns {*}
             */
            function fetchWikipediaImageURL(name) {
                if (name === undefined) {
                    return null;
                }
                var queryParams = {
                        action: 'query',
                        format: 'json',
                        prop: 'pageimages|imageinfo',
                        indexpageids: '',
                        iiprop: 'url',
                        pithumbsize: '600',
                        titles: 'Image:' + name,
                        callback: '?'
                    },
                    //query_params = 'action=query&prop=pageimages|imageinfo' +
                    //   '&indexpageids&iiprop=url&pithumbsize=600w&titles=Image:',
                    wiki_request_url = wiki_api_url + '?' + encodeQuery(queryParams);

                return Promise.resolve(
                    $.ajax({
                        url: wiki_request_url,
                        // data: { format: 'json' },
                        dataType: 'jsonp'
                    })
                )
                    .then(function (data) {
                        //console.debug("FetchWikipediaImage data:",data);
                        var pageid = data.query.pageids[0];
                        return data.query.pages[pageid].thumbnail.source;
                    })
                    .catch(function (err) {
                        console.error('while fetching wikipedia image at "' + wiki_request_url + '":', err);
                        return null;
                    });
            }

            function getTaxonClient() {
                return new DynamicServiceClient({
                    url: runtime.config('services.service_wizard.url'),
                    token: runtime.service('session').getAuthToken(),
                    module: 'TaxonAPI'
                });
            }

            function renderError(node, error) {
                node.innerHTML = BS.buildPanel({
                    type: 'danger',
                    title: 'Error',
                    body: error.message
                });
            }

            var taxon = getTaxonClient();
            var loadingCalls = [];

            var scientificName;

            // Call 1: do most the work, and kick off the scientific lineage + wikipedia fetching
            loadingCalls.push(
                taxon
                    .callFunc('get_all_data', [
                        {
                            ref: taxon_ref,
                            exclude_children: 1
                        }
                    ])
                    .spread(function (data) {
                        scientificName = data['scientific_name'];

                        setDataElementHTML('scientific-name', scientificName);

                        /* KINGDOM IS ALWAYS MISSING IN DATA --setDataElementHTML('kingdom', data['kingdom']); */
                        setDataElementHTML('domain', data['domain']);
                        renderNCBILink(data['taxonomic_id']);
                        setDataElementHTML('genetic-code', data['genetic_code']);

                        renderAliases(data['aliases']);

                        return taxon.callFunc('get_decorated_scientific_lineage', [{ ref: taxon_ref }]);
                    })
                    .spread(function (lineage) {
                        renderLineage(lineage.decorated_scientific_lineage, scientificName);
                        return fetchWikipediaEntry(scientificName);
                    })
                    .then(function (wiki_content) {
                        wikiInfo = wiki_content;
                        if (wikiInfo === false) {
                            //console.debug('No wikiInfo');
                            renderWikipediaEntry(null);
                            return false;
                        } else {
                            renderWikipediaEntry(wikiInfo);
                        }
                        return fetchWikipediaImageURL(wikiInfo.image);
                    })
                    .then(function (wikiImage) {
                        if (wikiImage === null) {
                            renderWikipediaImage(null);
                        } else {
                            renderWikipediaImage(wikiImage);
                        }
                    })
                    .catch(function (err) {
                        renderError(document.getElementById('overview'), err);
                        renderError(document.getElementById('moreTaxonInfo'), err);
                    })
            );

            // Call 3: get the decorated children
            loadingCalls.push(
                taxon
                    .callFunc('get_decorated_children', [{ ref: taxon_ref }])
                    .spread(function (lineage) {
                        renderChildren(lineage.decorated_children);
                    })
                    .catch(function (err) {
                        renderError(document.getElementById('taxonChildren'), err);
                    })
            );

            return Promise.all(loadingCalls).catch(function (err) {
                console.error(err);
            });
        }

        function stop() {
            // nothing to do
        }

        function detach() {
            // nothing to do necessarily, since the parent dom node will
            // be removed the controller for this widget removes it,
            // but it is nice to take responsibility for undoing what we
            // changed in the parent node:
            if (parent && container) {
                container.innerHTML = '';
                parent.removeChild(container);
            }
        }

        return Object.freeze({
            attach: attach,
            start: start,
            stop: stop,
            detach: detach
        });
    }

    return {
        make: function (config) {
            return factory(config);
        }
    };
});
