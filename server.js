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

function validate(constraints) {
    return function (req, res, next) {
        var invalid = [];
        var unknown = [];
        var result = {
            hasErrors: false
        };

        var data = req.body;

        for (var key in data) {
            if (data.hasOwnProperty(key)) {
                var value = data[key].trim();

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

        if (invalid.length > 0) {
            result.invalid = invalid;
        }

        if (unknown.length > 0) {
            result.unknown = unknown;
        }

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
    hostname: /^[a-zA-Z0-9_]{1,32}$/,
    key: /^[a-fA-F0-9]{64}$/,
    email: /^([a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)?$/
};

var NodeEntryAlreadyExistsError = function (hostname) {
    this._hostname = hostname;
};

NodeEntryAlreadyExistsError.prototype = new Error();
NodeEntryAlreadyExistsError.prototype.getHostname = function () {
    return this._hostname;
};

function createNodeFile(req, res, next) {
    var hostname = req.body.hostname.trim();
    var key = req.body.key.trim();
    var email = req.body.email.trim();

    var filename = peersPath + "/" + hostname;
    var data = "";

    data += "# Knotenname: " + hostname + "\n";
    data += "# Kontakt: " + email + "\n";
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

