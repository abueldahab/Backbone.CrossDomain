// Backbone.CrossDomainModel 0.1.0
//
// (c) 2013 Victor Quinn
// Licensed under the MIT license.

(function (root, factory) {
   if (typeof define === "function" && define.amd) {
      // AMD. Register as an anonymous module.
      define(["underscore","backbone"], function(_, Backbone) {
        // Use global variables if the locals are undefined.
        return factory(_ || root._, Backbone || root.Backbone);
      });
   } else {
      // RequireJS isn't being used. Assume underscore and backbone are loaded in <script> tags
      factory(_, Backbone);
   }
}(this, function(_, Backbone) {

    // Helper function to determine the request url given model and options objects
    function requestUrl(model, options) {
        var requestUrl = null;
        // First try the options object
        try {
            requestUrl = options.url;
        } catch(x) {}

        // Then try the model's url
        if (!requestUrl) {
            try {
                requestUrl = _.isFunction(model.url) ? model.url() : model.url;
            } catch(x) {}
        }

        return requestUrl;
    }

    // Helper function to determine whether protocols differ.
    function protocolsDiffer(thisProtocol, requestProtocol) {
        if (thisProtocol === ':' || requestProtocol === ":") {
            return false;
        }

        else if (thisProtocol === requestProtocol) {
            return false;
        }

        return true;
    }

    // Map from CRUD to HTTP for our default `Backbone.sync` implementation.

    var methodMap = {
        'create': 'POST',
        'update': 'PUT',
        'patch':  'PATCH',
        'delete': 'DELETE',
        'read':   'GET'
    };

    Backbone.vanillaSync = Backbone.sync;

    // Override 'Backbone.sync' to default to CrossDomainModel sync.
    // the original 'Backbone.sync' is still available in 'Backbone.vanillaSync'
    Backbone.sync = function(method, model, options) {

        // See if we need to use the XDomainRequest object for IE. If the request is on the
        // same domain, we can fall back on the normal Backbone.ajax handling.
        var useXDomainRequest = false;

        // See https://gist.github.com/jlong/2428561
        var thisDomainParser = document.createElement('a');
        thisDomainParser.href = document.URL;

        var requestDomainParser = document.createElement('a');
        requestDomainParser.href = requestUrl(model, options);

        if (requestDomainParser.host !== "" && (thisDomainParser.host !== requestDomainParser.host)) {
            useXDomainRequest = true;
        }

        // This currently catches IE10 as well which supports XMLHttpRequest so it should
        // probably only trap IE < 10.
        if (useXDomainRequest && window.XDomainRequest) {


            // See this article for more details on all the silly nuances: http://vq.io/14DJ1Tv

            // Check if protocols differ, if so throw an error so the app devs can handle.
            if (protocolsDiffer(thisDomainParser.protocol, requestDomainParser.protocol)) {
                throw new Error('Backbone.CrossDomain only works for same protocol requests (HTTP -> HTTP, HTTPS -> HTTPS) cannot mix.');
            }

            // Basically Backbone.sync rewritten to use XDomainRequest object
            var type = methodMap[method];

            // Default options, unless specified.
            _.defaults(options || (options = {}), {
                emulateHTTP: Backbone.emulateHTTP,
                emulateJSON: Backbone.emulateJSON
            });

            // XDomainRequest only works with POST. So DELETE/PUT/PATCH can't work here.

            // Note: Conscious decision to throw error rather than try to munge the request and
            // do something like force "options.emulateHTTP = true" because we want developers
            // to notice they're trying to do something illegal with this request and it may
            // require server-side changes for compatibility.
            if (!options.emulateHTTP && (method === 'update' || method === 'patch' || method === 'delete')) {
                throw new Error('Backbone.CrossDomain cannot use PUT, PATCH, DELETE with XDomainRequest (IE) and emulateHTTP=false');
            }

            // Default JSON-request options.
            var params = {type: type, dataType: 'json'};

            // Ensure that we have a URL.
            if (!options.url) {
                params.url = _.result(model, 'url') || urlError();
            }

            // TODO: XDomainRequest only accepts text/plain Content-Type header

            // TODO: XDomainRequest doesn't like other headers

            // Ensure that we have the appropriate request data.
            if (options.data == null && model && (method === 'create' || method === 'update' || method === 'patch')) {
                params.contentType = 'application/json';
                params.data = JSON.stringify(options.attrs || model.toJSON(options));
            }

            // For older servers, emulate JSON by encoding the request into an HTML-form.
            if (options.emulateJSON) {
                params.contentType = 'application/x-www-form-urlencoded';
                params.data = params.data ? {model: params.data} : {};
            }

            // For older servers, emulate HTTP by mimicking the HTTP method with `_method`
            // And an `X-HTTP-Method-Override` header.
            if (options.emulateHTTP && (type === 'PUT' || type === 'DELETE' || type === 'PATCH')) {
                params.type = 'POST';
                if (options.emulateJSON) params.data._method = type;
                var beforeSend = options.beforeSend;
                options.beforeSend = function(xhr) {
                    xhr.setRequestHeader('X-HTTP-Method-Override', type);
                    if (beforeSend) return beforeSend.apply(this, arguments);
                };
            }

            // Don't process data on a non-GET request.
            if (params.type !== 'GET' && !options.emulateJSON) {
                params.processData = false;
            }

            var xdr = options.xhr = new XDomainRequest();

            var success = options.success;
            xdr.onload = function(resp) {
                resp = JSON.parse(xdr.responseText);
                if (resp) success(model, resp, options);
                model.trigger('sync', model, resp, options);
            }

            var error = options.error;
            xdr.onerror = function(xdr) {
                if (error) error(model, xdr, options);
                model.trigger('error', model, xdr, options);
            };

            // Make the request using XDomainRequest


            xdr.open(params.type, params.url);
            xdr.send(params.data);

            model.trigger('request', model, xdr, options);
            return xdr;
        }
        else {
            return Backbone.vanillaSync.apply(this, arguments);
        }
    };

    return Backbone;
}));
