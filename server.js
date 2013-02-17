// config

var port = 8080;
var peersPath = "/tmp/peers"; // needs to exist already


// modules

var express = require("express");
var fs = require("fs");


// validation

var ValidationError = function (result) {
    this._result = result;
};

ValidationError.prototype = new Error();

ValidationError.prototype.getResult = function () {
    return this._result;
};

function normalizeString(str) {
    return str.trim().replace(/\s+/g, " ");
}

function validate(constraints) {
    return function (req, res, next) {
        var invalid = [];
        var unknown = [];
        var missing = [];
        var result = {
            hasErrors: false
        };

        var data = req.body;

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
    key: /^[a-fA-F0-9]{64}$/,
    email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    nickname: /^[-a-zA-Z0-9_ äöüÄÖÜß]{1,64}$/,
    mac: /^([a-fA-F0-9]{12}|([a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2})$/,
    coords: /^(-?[0-9]{1,3}(\.[0-9]{1,15})? -?[0-9]{1,3}(\.[0-9]{1,15})?)?$/
};

var NodeEntryAlreadyExistsError = function (hostname) {
    this._hostname = hostname;
};

NodeEntryAlreadyExistsError.prototype = new Error();
NodeEntryAlreadyExistsError.prototype.getHostname = function () {
    return this._hostname;
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

function createNodeFile(req, res, next) {
    var hostname = normalizeString(req.body.hostname);
    var key = normalizeString(req.body.key);
    var email = normalizeString(req.body.email);
    var nickname = normalizeString(req.body.nickname);
    var mac = normalizeMac(normalizeString(req.body.mac));
    var coords = normalizeString(req.body.coords);

    var filename = peersPath + "/" + hostname;
    var data = "";

    data += "# Knotenname: " + hostname + "\n";
    data += "# Ansprechpartner: " + nickname + "\n";
    data += "# Kontakt: " + email + "\n";
    data += "# Koordinaten: " + coords + "\n";
    data += "# MAC: " + mac + "\n";
    data += "key \"" + key + "\";\n";

    console.log("Creating new node file: " + filename);
    console.log(data);

    var errorHandler = function (err) {
        console.log("Creation of new node file failed: " + filename + "\n");
        return next(err);
    }

    // since node.js is single threaded we don't need a lock
    
    var exists = true;
    try {
        exists =  fs.existsSync(filename);
    }
    catch (err) {
        return errorHandler(err);
    }

    if (exists) {
        return errorHandler(new NodeEntryAlreadyExistsError(hostname));
    }

    try {
        fs.writeFileSync(filename, data, "utf8");
    }
    catch (err) {
        return errorHandler(err);
    }

    console.log("Created new node file: " + filename);

    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify({ status: "success" }));
}

app.post("/api/node", validate(constraints), createNodeFile);

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
    else if (err) {
        console.log(JSON.stringify(err));
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

