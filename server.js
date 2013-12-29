// config

var port = 8080;
var peersPath = "/tmp/peers"; // needs to exist already


// modules

var express = require("express");
var fs = require("fs");
var glob = require("glob");
var _ = require("underscore");
var crypto = require("crypto");


// validation

var ValidationError = function (result) {
    this._result = result;
};

ValidationError.prototype = new Error();

ValidationError.prototype.getResult = function () {
    return this._result;
};

function normalizeString(str) {
    return _.isString(str) ? str.trim().replace(/\s+/g, " ") : str;
}

function getData(req) {
    return _.extend({}, req.body, req.params);
}

function validate(constraints) {
    return function (req, res, next) {
        var invalid = [];
        var unknown = [];
        var missing = [];
        var result = {
            hasErrors: false
        };

        var data = getData(req);

        var key;

        for (key in constraints) {
            if (data[key] === null || data[key] === undefined) {
                missing.push(key);
                result.hasErrors = true;
            }   
        }

        for (key in data) {
            if (data.hasOwnProperty(key)) {
                var value = normalizeString(data[key]);

                if (!constraints[key]) {
                    unknown.push(key);
                    result.hasErrors = true;
                }
                else if (!value.match(constraints[key])) {
                    invalid.push(key);
                    result.hasErrors = true;
                }
            }
        }

        result.missing = missing;
        result.invalid = invalid;
        result.unknown = unknown;

        if (result.hasErrors) {
            return next(new ValidationError(result));
        }

        return next();
    }
}


// app / routes

var app = express();

app.use(express.bodyParser());
app.use("/", express.static(__dirname + "/static"));

app.get("/", function(req, res, next) {
    fs.readFile("static/index.html", "utf8", function (err, body) {
        if (err) return next(err);

        res.writeHead(200, {"Content-Type": "text/html"});
        res.end(body);
    });
});

var constraints = {
    hostname: /^[-a-zA-Z0-9_]{1,32}$/,
    key: /^([a-fA-F0-9]{64})?$/,
    email: /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/,
    nickname: /^[-a-zA-Z0-9_ äöüÄÖÜß]{1,64}$/,
    mac: /^([a-fA-F0-9]{12}|([a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2})$/,
    coords: /^(-?[0-9]{1,3}(\.[0-9]{1,15})? -?[0-9]{1,3}(\.[0-9]{1,15})?)?$/
};

var tokenConstraint = {
    token: /^[a-f0-9]{16}/
};

var constraintsWithToken = _.extend({}, constraints, tokenConstraint);

var NodeEntryAlreadyExistsError = function (hostname) {
    this._hostname = hostname;
};

NodeEntryAlreadyExistsError.prototype = new Error();
NodeEntryAlreadyExistsError.prototype.getHostname = function () {
    return this._hostname;
};

var MacEntryAlreadyExistsError = function (mac) {
    this._mac = mac;
};

MacEntryAlreadyExistsError.prototype = new Error();
MacEntryAlreadyExistsError.prototype.getMac = function () {
    return this._mac;
};

var KeyEntryAlreadyExistsError = function (key) {
    this._key = key;
};

KeyEntryAlreadyExistsError.prototype = new Error();
KeyEntryAlreadyExistsError.prototype.getKey = function () {
    return this._key;
};

var NodeNotFoundError = function (token) {
    this._token = token;
};

NodeNotFoundError.prototype = new Error();
NodeNotFoundError.prototype.getToken = function () {
    return this._token;
};

function normalizeMac(mac) {
    // parts only contains values at odd indexes
    var parts = mac.toUpperCase().replace(/:/g, "").split(/([A-F0-9]{2})/);

    var macParts = [];

    for (var i = 1; i < parts.length; i += 2) {
        macParts.push(parts[i]);
    }

    return macParts.join(":");
}

function findNodeFiles(pattern) {
    return glob.sync(peersPath + "/" + pattern);
}

function generateToken() {
    return crypto.randomBytes(8).toString("hex");
}

function isDuplicate(pattern, token) {
    var files = findNodeFiles(pattern);
    if (files.length === 0) {
        return false;
    }

    if (files.length > 1 || !token) {
        return true;
    }

    var file = files[0];
    return file.substring(file.length - token.length, file.length) !== token;
}

function checkNoDuplicates(hostname, mac, key, token) {
    if (isDuplicate(hostname.toLowerCase() + "@*@*@*", token)) {
        return new NodeEntryAlreadyExistsError(hostname);
    }

    if (isDuplicate("*@" + mac.toLowerCase() + "@*@*", token)) {
        return new MacEntryAlreadyExistsError(mac);
    }

    if (key) {
        if (isDuplicate("*@*@" + key.toLowerCase() + "@*", token)) {
            return new KeyEntryAlreadyExistsError(key);
        }
    }
    return null;
}

function createNodeFile(req, res, next) {
    var postData = getData(req);

    var hostname = normalizeString(postData.hostname);
    var key = normalizeString(postData.key);
    var email = normalizeString(postData.email);
    var nickname = normalizeString(postData.nickname);
    var mac = normalizeMac(normalizeString(postData.mac));
    var coords = normalizeString(postData.coords);

    var token = normalizeString(postData.token);
    var isUpdate = !!token;
    if (!token) {
        token = generateToken();
    }

    var filename = peersPath + "/" + hostname + "@" + mac + "@" + key + "@" + token;
    var data = "";

    data += "# Knotenname: " + hostname + "\n";
    data += "# Ansprechpartner: " + nickname + "\n";
    data += "# Kontakt: " + email + "\n";
    data += "# Koordinaten: " + coords + "\n";
    data += "# MAC: " + mac + "\n";
    data += "# Token: " + token + "\n";
    if (key) {
        data += "key \"" + key + "\";\n";
    }

    console.log("Creating new node file: " + filename);
    console.log(data);

    var errorHandler = function (err) {
        console.log("Creation of new node file failed: " + filename + "\n");
        return next(err);
    }

    // since node.js is single threaded we don't need a lock
    
    var e;
    if (isUpdate) {
        var files = findNodeFiles("*@*@*@" + token);
        if (files.length !== 1) {
            return next(new NodeNotFoundError(token));
        }

        e = checkNoDuplicates(hostname, mac, key, token);
        if (e) {
            return errorHandler(e);
        }

        var file = files[0];
        fs.unlinkSync(file);
    } else {
        e = checkNoDuplicates(hostname, mac, key, null);
        if (e) {
            return errorHandler(e);
        }
    }

    try {
        fs.writeFileSync(filename, data, "utf8");
    }
    catch (err) {
        return errorHandler(err);
    }

    console.log("Created new node file: " + filename);

    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify(_.defaults({ status: "success", token: token }, postData)));
}

function getNodeData(req, res, next) {
    var token = normalizeString(getData(req).token);

    var files = findNodeFiles("*@*@*@" + token);
    if (files.length !== 1) {
        return next(new NodeNotFoundError(token));
    }

    var file = files[0];
    var lines = fs.readFileSync(file).toString();

    var data = {};

    _.each(lines.split("\n"), function (line) {
        var linePrefixes = {
            hostname: "# Knotenname: ",
            nickname: "# Ansprechpartner: ",
            email: "# Kontakt: ",
            coords: "# Koordinaten: ",
            mac: "# MAC: ",
            token: "# Token: "
        };

        var match = _.reduce(linePrefixes, function (match, prefix, key) {
            if (!_.isEmpty(match)) {
                return match;
            }

            if (line.substring(0, prefix.length) === prefix) {
                match[key] = normalizeString(line.substr(prefix.length));
                return match;
            }

            return {};
        }, {});

        if (_.isEmpty(match) && line.substring(0, 5) === "key \"") {
            match.key = normalizeString(line.split("\"")[1]);
        }

        _.each(match, function (value, key) {
            data[key] = value;
        });
    });

    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify(data));
}

app.post("/api/node", validate(constraints), createNodeFile);
app.put("/api/node/:token", validate(constraintsWithToken), createNodeFile);
app.get("/api/node/:token", validate(tokenConstraint), getNodeData);

function respondWithJson(res, code, data) {
    res.writeHead(code, {"Content-Type": "application/json"});
    res.end(JSON.stringify(data));
}

app.use(function(err, req, res, next) {
    if (err instanceof ValidationError) {
        return respondWithJson(res, 400, {
            status: "error",
            type: "ValidationError",
            validationResult: err.getResult()
        });
    }
    else if (err instanceof NodeEntryAlreadyExistsError) {
        return respondWithJson(res, 409, {
            status: "error",
            type: "NodeEntryAlreadyExistsError",
            hostname: err.getHostname()
        });
    }
    else if (err instanceof MacEntryAlreadyExistsError) {
        return respondWithJson(res, 409, {
            status: "error",
            type: "MacEntryAlreadyExistsError",
            mac: err.getMac()
        });
    }
    else if (err instanceof KeyEntryAlreadyExistsError) {
        return respondWithJson(res, 409, {
            status: "error",
            type: "KeyEntryAlreadyExistsError",
            key: err.getKey()
        });
    }
    else if (err instanceof NodeNotFoundError) {
        return respondWithJson(res, 404, {
            status: "error",
            type: "NodeNotFoundError",
            token: err.getToken()
        });
    }
    else if (_.isObject(err)) {
        console.trace("Internal error:", JSON.stringify(err));
        return respondWithJson(res, 500, {
            status: "error",
            type: "internal"
        });
    }
    else {
        return next();
    }
});

app.listen(port);

