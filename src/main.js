"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const net_1 = __importDefault(require("net"));
const STATUSCODES = {
    CONTINUE: { code: 100, response: "Continue" },
    SWITCHING_PROTOCOLS: { code: 101, response: "Switching Protocols" },
    EARLY_HINTS: { code: 103, response: "Early Hints" },
    OK: { code: 200, response: "Ok" },
    CREATED: { code: 201, response: "Created" },
    ACCEPTED: { code: 202, response: "Accepted" },
    NO_CONTENT: { code: 204, response: "No Content" },
    MOVED_PERMANENTLY: { code: 301, response: "Moved Permanently" },
    FOUND: { code: 302, response: "Found" },
    SEE_OTHER: { code: 303, response: "See Other" },
    BAD_REQUEST: { code: 400, response: "Bad Request" },
    UNAUTHORIZED: { code: 401, response: "Unauthorized" },
    FORBIDDEN: { code: 403, response: "Forbidden" },
    NOT_FOUND: { code: 404, response: "Not Found" },
    TEAPOT: { code: 418, response: "I'm a teapot" },
};
var HTTPMethods;
(function (HTTPMethods) {
    HTTPMethods["GET"] = "get";
    HTTPMethods["HEAD"] = "head";
    HTTPMethods["DELETE"] = "delete";
    HTTPMethods["CONNECT"] = "connect";
    HTTPMethods["OPTIONS"] = "options";
    HTTPMethods["TRACE"] = "trace";
    HTTPMethods["PATCH"] = "patch";
    HTTPMethods["POST"] = "post";
    HTTPMethods["PUT"] = "put";
})(HTTPMethods || (HTTPMethods = {}));
const compose = (...func) => {
    return (x) => {
        return func.reduceRight((prev, f) => f(prev), x);
    };
};
const makeResponse = (statusCode, otherHeaders, body) => {
    return compose(([response, otherHeaders, body]) => {
        if (otherHeaders.find(([field, _]) => {
            return field === "Content-Type";
        }) &&
            body !== undefined) {
            if (typeof body === "string") {
                return response + body;
            }
            else {
                return Buffer.concat([Buffer.from(response, "utf8"), body]);
            }
        }
        else {
            return response;
        }
    }, ([response, otherHeaders, body]) => {
        return [response + "\r\n\r\n", otherHeaders, body];
    }, ([statusCode, otherHeaders, body]) => {
        return [
            otherHeaders
                .reduce((headers, header) => {
                return [...headers, header];
            }, [["Server", "DP_PROJEKT"]])
                .reduce((headersString, [field, value]) => {
                return headersString + `\r\n${field}:${value}`;
            }, statusCodeToString(statusCode)),
            otherHeaders,
            body,
        ];
    })([statusCode, otherHeaders, body]);
};
const statusCodeToString = (statusCode, protocolVersion = "HTTP/1.1") => {
    return `${protocolVersion} ${statusCode.code.toString()} ${statusCode.response}`;
};
const tryGetFileType = (path) => {
    const extension = path.slice(path.lastIndexOf(".") + 1);
    switch (extension) {
        case "js":
            return "application/javascript";
        case "json":
            return "application/json";
        case "css":
            return "text/css";
        case "html":
            return "text/html";
        case "txt":
            return "text/plain";
        case "svg":
            return "image/svg+xml";
        case "png":
            return "image/png";
        case "gif":
            return "image/gif";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "webp":
            return "image/webp";
        case "ico":
            return "image/x-icon";
        case "mp3":
            return "audio/mpeg";
        case "wav":
            return "audio/wav";
        case "mp4":
            return "video/mp4";
        case "mpeg":
            return "video/mpeg";
        case "ttf":
            return "font/ttf";
        default:
            return "text/plain";
    }
};
const tryReadFile = (request, prefix = undefined) => {
    try {
        const fileContents = (0, fs_1.readFileSync)(`.${prefix ? prefix : ""}${request.path}`);
        const fileContentType = tryGetFileType(request.path);
        if (fileContentType.includes("image/") ||
            fileContentType.includes("audio/") ||
            fileContentType.includes("video/")) {
            return {
                fileContents,
                fileContentType,
            };
        }
        else {
            return {
                fileContents: fileContents.toString("utf8"),
                fileContentType,
            };
        }
    }
    catch (err) {
        return undefined;
    }
};
// WARN: https://www.rfc-editor.org/rfc/rfc3986#section-6.2.3
const removeDots = (uri) => {
    return removeDotsRecursive(uri).join("");
};
const removeDotsRecursive = (uri) => {
    if (uri.length === 0) {
        return [];
    }
    if (uri.indexOf("../") === 0) {
        // A
        return removeDotsRecursive(uri.replace("../", ""));
    }
    else if (uri.indexOf("./") === 0) {
        // A
        return removeDotsRecursive(uri.replace("./", ""));
    }
    else if (uri.indexOf("/./") === 0) {
        // B
        return removeDotsRecursive(uri.replace("/./", "/"));
    }
    else if (uri.indexOf("/.") === 0) {
        // B
        return removeDotsRecursive(uri.replace("/.", "/"));
    }
    else if (uri.indexOf("/../") === 0) {
        // C
        const buf = removeDotsRecursive(uri.replace("/../", "/"));
        return buf.slice(0, buf.length - 1);
    }
    else if (uri.indexOf("/..") === 0) {
        // C
        const buf = removeDotsRecursive(uri.replace("/..", "/"));
        return buf.slice(0, buf.length - 1);
    }
    else if (uri.indexOf("..") === 0) {
        // D
        return removeDotsRecursive(uri.replace("..", ""));
    }
    else if (uri.indexOf(".") === 0) {
        // D
        return removeDotsRecursive(uri.replace(".", ""));
    }
    else {
        const part = uri.substring(0, uri.indexOf("/", 1));
        return [
            part !== "" ? part : uri,
            ...removeDotsRecursive(part !== "" ? uri.replace(part, "") : ""),
        ];
    }
};
const removeWhitespace = (uri) => {
    if (uri.indexOf(" ") !== -1) {
        return removeWhitespace(uri.replace(" ", ""));
    }
    else {
        return uri;
    }
};
const normalizeURI = (uri) => {
    return compose(removeDots, removeWhitespace, decodeURI)(uri);
};
const extractQueryStrings = (uri) => {
    const lastUriSegment = uri.slice(uri.lastIndexOf("/") + 1);
    if (lastUriSegment.includes("?")) {
        return [
            uri.slice(0, uri.indexOf("?")),
            lastUriSegment
                .slice(lastUriSegment.indexOf("?") + 1)
                .split("&")
                .reduce((queryString, value) => {
                const [field, val] = value.split("=");
                return Object.assign(Object.assign({}, queryString), { [field]: val });
            }, {}),
        ];
    }
    else {
        const pair = [uri, undefined];
        return pair;
    }
};
const parseHeaders = (data) => {
    const unparsedHeaders = data.split("\r\n");
    const headersEnd = unparsedHeaders.findIndex((line) => line === "");
    return unparsedHeaders
        .slice(1, headersEnd)
        .reduce((acc, line) => {
        const colonIndex = line.indexOf(":");
        const field = line.substring(0, colonIndex).toLowerCase();
        const value = line.substring(colonIndex + 1, line.length).trim();
        return Object.assign(Object.assign({}, acc), { [field]: value });
    }, {});
};
const getPayload = (headers, data) => {
    const contentType = headers["content-type"];
    if (contentType === undefined) {
        return undefined;
    }
    const payload = compose(([split, index]) => {
        return split.slice(index, split.length).join("");
    }, (split) => {
        return [split, split.findIndex((line) => line === "") + 1];
    }, (initialData) => {
        return initialData.split("\r\n");
    })(data);
    if (contentType === "application/json") {
        return JSON.parse(payload);
    }
    else if (contentType === "application/x-www-form-urlencoded") {
        return payload
            .split("&")
            .reduce((acc, current) => {
            const [field, value] = current.split("=");
            return Object.assign(Object.assign({}, acc), { [field]: value });
        }, {});
    }
    else if (contentType.includes("text/")) {
        return payload;
    }
};
const parseRequest = (data) => {
    const [method, uri, protocolVersion] = data
        .split("\r\n")[0]
        .split(" ")
        .slice(0, 3)
        .map((val) => val);
    const headers = parseHeaders(data);
    const [queryFreeUri, queryStrings] = extractQueryStrings(normalizeURI(uri));
    switch (method.toLowerCase()) {
        case HTTPMethods.GET:
        case HTTPMethods.HEAD:
        case HTTPMethods.CONNECT:
        case HTTPMethods.OPTIONS:
        case HTTPMethods.TRACE:
            return {
                method: method.toLowerCase(),
                path: queryFreeUri,
                protocolVersion,
                headers,
                payload: undefined,
                queryString: queryStrings,
            };
        case HTTPMethods.DELETE:
        case HTTPMethods.PATCH:
        case HTTPMethods.POST:
        case HTTPMethods.PUT:
            return {
                method: method.toLowerCase(),
                path: queryFreeUri,
                protocolVersion,
                headers,
                payload: getPayload(headers, data),
                queryString: queryStrings,
            };
        default:
            return undefined;
    }
};
const mergeRequestAndRoute = (request, routes) => {
    if (routes.length > 1) {
        return [
            ...mergeRequestAndRoute(request, routes.slice(0, routes.length - 1)),
            [request, routes[routes.length - 1]],
        ];
    }
    return [[request, ...routes]];
};
const pairArrayElements = (main, other) => {
    if (main.length !== other.length) {
        return [];
    }
    if (main.length === 0 || other.length === 0) {
        return [];
    }
    if (main.length === 1 && other.length === 1) {
        return [[main[0], other[0]]];
    }
    else {
        return [
            ...pairArrayElements(main.slice(0, main.length - 1), other.slice(0, other.length - 1)),
            [main[main.length - 1], other[other.length - 1]],
        ];
    }
};
const matchExactRoute = (merged) => {
    return merged.find(([request, route]) => {
        return route.method === request.method && route.path === request.path;
    });
};
const matchWildcardRoute = (merged) => {
    return merged
        .reduce((wildcardRoutes, pair) => {
        if (pair[1].path.includes("*")) {
            return [...wildcardRoutes, pair];
        }
        else {
            return [...wildcardRoutes];
        }
    }, [])
        .find(([request, route]) => {
        const matchBy = route.path.split("*")[0];
        return (route.method === request.method &&
            request.path.includes(matchBy));
    });
};
const matchVariablePathRoute = (merged) => {
    return merged
        .reduce((variablePathRoutes, [request, route]) => {
        const [variableSegments, pathSegment] = route.path
            .split("/")
            .reduce(([variableSegments, pathSegments], segment) => {
            const openingBracketIdx = segment.indexOf("{");
            const closingBrackedIdx = segment.indexOf("}");
            if (openingBracketIdx !== -1 &&
                closingBrackedIdx !== -1) {
                return [
                    [
                        ...variableSegments,
                        segment.slice(openingBracketIdx + 1, closingBrackedIdx),
                    ],
                    [...pathSegments, undefined],
                ];
            }
            else {
                return [
                    [...variableSegments, undefined],
                    [...pathSegments, segment],
                ];
            }
        }, [[], []]);
        const requestSegments = request.path
            .split("/")
            .reduce((segments, segment) => [...segments, segment], []);
        if (variableSegments.length === requestSegments.length) {
            const variables = pairArrayElements(variableSegments, requestSegments).reduce((variables, [vSegment, rSegment]) => {
                if (vSegment !== undefined) {
                    return Object.assign(Object.assign({}, variables), { [vSegment]: rSegment });
                }
                else {
                    return Object.assign({}, variables);
                }
            }, {});
            const pair = [
                Object.assign(Object.assign({}, request), { pathVariables: variables, pathSegments: requestSegments }),
                Object.assign(Object.assign({}, route), { pathSegments: pathSegment }),
            ];
            return [...variablePathRoutes, pair];
        }
        else {
            return [...variablePathRoutes];
        }
    }, [])
        .find(([request, route]) => {
        if (request.pathSegments && route.pathSegments) {
            const pairs = pairArrayElements(request.pathSegments, route.pathSegments);
            return pairs.reduce((validMatch, [reqSegment, routeSegment]) => {
                if (!validMatch) {
                    return false;
                }
                if (routeSegment === undefined) {
                    return validMatch;
                }
                if (reqSegment === routeSegment) {
                    return true;
                }
                else {
                    return false;
                }
            }, true);
        }
        else {
            return false;
        }
    });
};
const matchRoute = (request, routes) => {
    const merged = mergeRequestAndRoute(request, routes);
    const exactRoute = matchExactRoute(merged);
    if (exactRoute === undefined) {
        const variableRoute = matchVariablePathRoute(merged);
        if (variableRoute === undefined) {
            return matchWildcardRoute(merged);
        }
        else {
            return variableRoute;
        }
    }
    else {
        return exactRoute;
    }
};
const writeNotFoundToSocket = (socket) => {
    socket.write(makeResponse(STATUSCODES.NOT_FOUND, [], undefined));
};
const handleNewConnection = (socket, routes) => {
    socket.on("data", (buffer) => {
        try {
            const request = parseRequest(buffer.toString("utf8"));
            if (request) {
                const route = matchRoute(request, routes);
                if (route) {
                    const [nRequest, nRoute] = route;
                    nRoute.action(socket, nRequest);
                }
                else {
                    writeNotFoundToSocket(socket);
                }
            }
            else {
                writeNotFoundToSocket(socket);
            }
            socket.pipe(socket).end();
        }
        catch (e) {
            console.error(e);
        }
    });
};
const route = (method, path, action) => {
    return {
        method,
        path,
        action,
    };
};
const createServer = (hostname, port, ...routes) => {
    new net_1.default.Server()
        .listen(port, hostname, undefined, () => {
        console.log(`Server started on ${hostname}:${port}.`);
    })
        .on("connection", (socket) => {
        handleNewConnection(socket, routes);
    });
};
createServer("0.0.0.0", 8888, route(HTTPMethods.GET, "/", (socket) => {
    compose(([file, socket]) => {
        compose(([response, socket]) => {
            socket.write(response);
        }, ([file, socket]) => {
            return [
                makeResponse(STATUSCODES.OK, [
                    ["Content-Lenght", file.length.toString()],
                    ["Content-Type", "text/html"],
                ], file),
                socket,
            ];
        })([file, socket]);
    }, (socket) => {
        return [
            (0, fs_1.readFileSync)("./websites/index.html", {
                encoding: "utf8",
            }),
            socket,
        ];
    })(socket);
}), route(HTTPMethods.GET, "/websites/*", (socket, request) => {
    compose(([fileContents, socket]) => {
        compose(([response, socket]) => {
            socket.write(response);
        }, ([file, socket]) => {
            return [
                file !== undefined
                    ? makeResponse(STATUSCODES.OK, [
                        [
                            "Content-Lenght",
                            file.fileContents.length.toString(),
                        ],
                        [
                            "Content-Type",
                            file.fileContentType,
                        ],
                    ], file.fileContents)
                    : makeResponse(STATUSCODES.NOT_FOUND, [], undefined),
                socket,
            ];
        })([fileContents, socket]);
    }, ([socket, request]) => {
        return [
            request !== undefined ? tryReadFile(request) : undefined,
            socket,
        ];
    })([socket, request]);
}), route(HTTPMethods.GET, "/demo/{variable}/path/{uri}", (socket, request) => {
    const jsonValue = JSON.stringify(request === null || request === void 0 ? void 0 : request.pathVariables);
    compose(([socket, response]) => {
        socket.write(response);
    }, ([socket, jsonValue]) => {
        return [
            socket,
            makeResponse(STATUSCODES.OK, [
                ["Content-Lenght", jsonValue.length.toString()],
                ["Content-Type", "application/json"],
            ], jsonValue),
        ];
    })([socket, jsonValue]);
}), route(HTTPMethods.GET, "/query", (socket, request) => {
    const jsonValue = JSON.stringify(request === null || request === void 0 ? void 0 : request.queryString);
    compose(([socket, response]) => {
        socket.write(response);
    }, ([socket, jsonValue]) => {
        return [
            socket,
            makeResponse(STATUSCODES.OK, [
                ["Content-Lenght", jsonValue.length.toString()],
                ["Content-Type", "application/json"],
            ], jsonValue),
        ];
    })([socket, jsonValue]);
}), route(HTTPMethods.GET, "/form", (socket) => {
    compose(([socket, response]) => {
        socket.write(response);
    }, ([socket, file]) => {
        return [
            socket,
            makeResponse(STATUSCODES.OK, [
                ["Content-Lenght", file.length.toString()],
                ["Content-Type", "text/html"],
            ], file)
        ];
    }, (socket) => {
        return [socket,
            (0, fs_1.readFileSync)("./websites/form.html", { encoding: "utf8" })
        ];
    })(socket);
}), route(HTTPMethods.GET, "/getData", (socket) => {
    compose(([socket, response]) => {
        socket.write(response);
    }, ([socket, file]) => {
        return [
            socket,
            makeResponse(STATUSCODES.OK, [
                ["Content-Lenght", file.length.toString()],
                ["Content-Type", "application/json"],
            ], file)
        ];
    }, (socket) => {
        return [socket,
            (0, fs_1.readFileSync)("./websites/formdb.json", { encoding: "utf8" })
        ];
    })(socket);
}), route(HTTPMethods.POST, "/form", (socket, request) => {
    compose(([socket, response]) => {
        socket.write(response);
    }, ([socket, data]) => {
        return [
            socket,
            makeResponse(STATUSCODES.OK, [
                ["Content-Lenght", data.length.toString()],
                ["Content-Type", "application/json"],
            ], data)
        ];
    }, ([socket, data]) => {
        (0, fs_1.writeFileSync)("./websites/formdb.json", data);
        return [socket, data];
    }, ([socket, request, formDb]) => {
        return [
            socket,
            JSON.stringify({ db: [...formDb.db, request.payload] })
        ];
    }, ([socket, request]) => {
        return [socket,
            request,
            JSON.parse((0, fs_1.readFileSync)("./websites/formdb.json", { encoding: "utf8" })),
        ];
    })([socket, request]);
}));
