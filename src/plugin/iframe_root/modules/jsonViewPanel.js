define(['kb_lib/html', 'kbaseUI/widget/widgetSet', 'utils'], function (html, WidgetSet, utils) {
    'use strict';

    function factory(config) {
        var runtime = config.runtime,
            container,
            widgetSet = runtime.service('widget').newWidgetSet(),
            t = html.tag,
            layout;

        function renderLayout() {
            var div = t('div');
            return div(
                {
                    class: 'container-fluid',
                    style: {
                        width: '100%'
                    },
                    dataKBTesthookPlugin: 'dataview'
                },
                [
                    div({ class: 'row' }, [
                        div({ class: 'col-md-8' }, [div({ id: widgetSet.addWidget('kb_dataview_jsonView') })]),
                        div({ class: 'col-md-4' }, [div({ id: widgetSet.addWidget('kb_dataview_jsonViewOverview') })])
                    ])
                ]
            );
        }

        function init(config) {
            layout = renderLayout();
            runtime.send('ui', 'setTitle', 'JSON View');
            return widgetSet.init(config);
        }

        function attach(node) {
            container = node;
            container.innerHTML = layout;
            return widgetSet.attach(container);
        }

        function start(params) {
            return utils.getObject(runtime, params).then(function (object) {
                return widgetSet.start({ object: object });
            });
        }

        function stop() {
            container.innerHTML = '';
            return widgetSet.stop();
        }

        return {
            init: init,
            attach: attach,
            start: start,
            stop: stop
        };
    }

    return {
        make: function (config) {
            return factory(config);
        }
    };
});
