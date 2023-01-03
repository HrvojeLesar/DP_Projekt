import { readFileSync } from "fs";
import net from "net";

type RequestHeaders = Record<string, string>;

type Request = {
    method: string;
    path: string;
    protocolVersion: string;
    headers: RequestHeaders | undefined;
    payload: any;
    queryString: QueryStrings | undefined;
    pathVariables?: Record<string, string>;
};

type StatusCode = {
    code: number;
    response: string;
};

type Route = {
    method: string;
    path: string;
    action: (socket: net.Socket, request: Request) => void;
};

type FileContents = {
    fileContents: string | Buffer;
    fileContentType: string;
};

type QueryStrings = Record<string, string>;

type StatsCodeTypes =
    | "CONTINUE"
    | "SWITCHING_PROTOCOLS"
    | "EARLY_HINTS"
    | "OK"
    | "CREATED"
    | "ACCEPTED"
    | "NO_CONTENT"
    | "MOVED_PERMANENTLY"
    | "FOUND"
    | "SEE_OTHER"
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "TEAPOT";

const STATUSCODES: Readonly<Record<StatsCodeTypes, StatusCode>> = {
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

enum HTTPMethods {
    GET = "get",
    HEAD = "head",
    DELETE = "delete",
    CONNECT = "connect",
    OPTIONS = "options",
    TRACE = "trace",
    PATCH = "patch",
    POST = "post",
    PUT = "put",
}

const compose = (...func: any[]) => {
    return (x: any) => {
        return func.reduceRight((prev, f) => f(prev), x);
    };
};

const makeResponse = (
    statusCode: StatusCode,
    otherHeaders: [string, string][],
    body: any
) => {
    return compose(
        ([response, otherHeaders, body]: [
            string,
            [string, string][],
            string | undefined | Buffer
        ]) => {
            if (
                otherHeaders.find(([field, _]) => {
                    return field === "Content-Type";
                }) &&
                body !== undefined
            ) {
                if (typeof body === "string") {
                    return response + body;
                } else {
                    return Buffer.concat([Buffer.from(response, "utf8"), body]);
                }
            } else {
                return response;
            }
        },
        ([response, otherHeaders, body]: [string, [string, string][], any]) => {
            return [response + "\r\n\r\n", otherHeaders, body];
        },
        ([statusCode, otherHeaders, body]: [
            StatusCode,
            [string, string][],
            any
        ]) => {
            return [
                otherHeaders
                    .reduce(
                        (headers: [string, string][], header) => {
                            return [...headers, header];
                        },
                        [["Server", "DP_PROJEKT"]]
                    )
                    .reduce((headersString, [field, value]) => {
                        return headersString + `\r\n${field}:${value}`;
                    }, statusCodeToString(statusCode)),
                otherHeaders,
                body,
            ];
        }
    )([statusCode, otherHeaders, body]);
};

const statusCodeToString = (
    statusCode: StatusCode,
    protocolVersion: string = "HTTP/1.1"
) => {
    return `${protocolVersion} ${statusCode.code.toString()} ${
        statusCode.response
    }`;
};

const tryGetFileType = (path: string) => {
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

const tryReadFile = (
    request: Request,
    prefix: string | undefined = undefined
): FileContents | undefined => {
    try {
        const fileContents = readFileSync(
            `.${prefix ? prefix : ""}${request.path}`
        );
        const fileContentType = tryGetFileType(request.path);
        if (
            fileContentType.includes("image/") ||
            fileContentType.includes("audio/") ||
            fileContentType.includes("video/")
        ) {
            return {
                fileContents,
                fileContentType,
            };
        } else {
            return {
                fileContents: fileContents.toString("utf8"),
                fileContentType,
            };
        }
    } catch (err) {
        return undefined;
    }
};

// WARN: https://www.rfc-editor.org/rfc/rfc3986#section-6.2.3
const removeDots = (uri: string) => {
    return removeDotsRecursive(uri).join("");
};

const removeDotsRecursive = (uri: string): string[] => {
    if (uri.length === 0) {
        return [];
    }

    if (uri.indexOf("../") === 0) {
        // A
        return removeDotsRecursive(uri.replace("../", ""));
    } else if (uri.indexOf("./") === 0) {
        // A
        return removeDotsRecursive(uri.replace("./", ""));
    } else if (uri.indexOf("/./") === 0) {
        // B
        return removeDotsRecursive(uri.replace("/./", "/"));
    } else if (uri.indexOf("/.") === 0) {
        // B
        return removeDotsRecursive(uri.replace("/.", "/"));
    } else if (uri.indexOf("/../") === 0) {
        // C
        const buf = removeDotsRecursive(uri.replace("/../", "/"));
        return buf.slice(0, buf.length - 1);
    } else if (uri.indexOf("/..") === 0) {
        // C
        const buf = removeDotsRecursive(uri.replace("/..", "/"));
        return buf.slice(0, buf.length - 1);
    } else if (uri.indexOf("..") === 0) {
        // D
        return removeDotsRecursive(uri.replace("..", ""));
    } else if (uri.indexOf(".") === 0) {
        // D
        return removeDotsRecursive(uri.replace(".", ""));
    } else {
        const part = uri.substring(0, uri.indexOf("/", 1));
        return [
            part !== "" ? part : uri,
            ...removeDotsRecursive(part !== "" ? uri.replace(part, "") : ""),
        ];
    }
};

const removeWhitespace = (uri: string): string => {
    if (uri.indexOf(" ") !== -1) {
        return removeWhitespace(uri.replace(" ", ""));
    } else {
        return uri;
    }
};

const normalizeURI = (uri: string): string => {
    return compose(removeDots, removeWhitespace, decodeURI)(uri);
};

const extractQueryStrings = (uri: string) => {
    const lastUriSegment = uri.slice(uri.lastIndexOf("/") + 1);
    if (lastUriSegment.includes("?")) {
        return lastUriSegment
            .slice(lastUriSegment.indexOf("?") + 1)
            .split("&")
            .reduce((queryString: QueryStrings, value) => {
                const [field, val] = value.split("=");
                return { ...queryString, [field]: val };
            }, {});
    } else {
        return undefined;
    }
};

const parseHeaders = (data: string) => {
    const unparsedHeaders = data.split("\r\n");
    const headersEnd = unparsedHeaders.findIndex((line) => line === "");
    return unparsedHeaders
        .slice(1, headersEnd)
        .reduce((acc: RequestHeaders, line) => {
            const colonIndex = line.indexOf(":");
            const field = line.substring(0, colonIndex).toLowerCase();
            const value = line.substring(colonIndex + 1, line.length).trim();
            return { ...acc, [field]: value };
        }, {});
};

const getPayload = (
    headers: RequestHeaders,
    data: string
): Record<string, string> | string | undefined => {
    const contentType = headers["content-type"];
    if (contentType === undefined) {
        return undefined;
    }
    const payload: string = compose(
        ([split, index]: [string[], number]) => {
            return split.slice(index, split.length).join("");
        },
        (split: string[]) => {
            return [split, split.findIndex((line) => line === "") + 1];
        },
        (initialData: string) => {
            return initialData.split("\r\n");
        }
    )(data);
    if (contentType === "application/json") {
        return JSON.parse(payload);
    } else if (contentType === "application/x-www-form-urlencoded") {
        return payload
            .split("&")
            .reduce((acc: Record<string, string>, current) => {
                const [field, value] = current.split("=");
                return { ...acc, [field]: value };
            }, {});
    } else if (contentType.includes("text/")) {
        return payload;
    }
};

const parseRequest = (data: string): Request | undefined => {
    const [method, uri, protocolVersion] = data
        .split("\r\n")[0]
        .split(" ")
        .slice(0, 3)
        .map((val) => val);
    const headers = parseHeaders(data);
    switch (method.toLowerCase()) {
        case HTTPMethods.GET:
        case HTTPMethods.HEAD:
        case HTTPMethods.DELETE:
        case HTTPMethods.CONNECT:
        case HTTPMethods.OPTIONS:
        case HTTPMethods.TRACE:
        case HTTPMethods.PATCH:
            return {
                method: method.toLowerCase(),
                path: normalizeURI(uri),
                protocolVersion,
                headers,
                payload: undefined,
                queryString: extractQueryStrings(uri),
            };
        case HTTPMethods.POST:
        case HTTPMethods.PUT:
            return {
                method: method.toLowerCase(),
                path: normalizeURI(uri),
                protocolVersion,
                headers,
                payload: getPayload(headers, data),
                queryString: extractQueryStrings(uri),
            };
        default:
            return undefined;
    }
};

const mergeRequestAndRoute = (request: Request, routes: Route[]): any => {
    if (routes.length > 1) {
        return [
            ...mergeRequestAndRoute(
                request,
                routes.slice(0, routes.length - 1)
            ),
            [request, routes[routes.length - 1]],
        ];
    }
    return [[request, ...routes]];
};

const pairArrayElements = <T, O>(main: T[], other: O[]): [T, O][] => {
    if (main.length !== other.length) {
        return [];
    }
    if (main.length === 0 || other.length === 0) {
        return [];
    }
    if (main.length === 1 && other.length === 1) {
        return [[main[0], other[0]]];
    } else {
        return [
            ...pairArrayElements(
                main.slice(0, main.length - 1),
                other.slice(0, other.length - 1)
            ),
            [main[main.length - 1], other[other.length - 1]],
        ];
    }
};

const matchExactRoute = (merged: [Request, Route][]) => {
    return merged.find(([request, route]) => {
        return route.method === request.method && route.path === request.path;
    });
};

const matchWildcardRoute = (merged: [Request, Route][]) => {
    return merged
        .reduce((wildcardRoutes: [Request, Route][], pair) => {
            if (pair[1].path.includes("*")) {
                return [...wildcardRoutes, pair];
            } else {
                return [...wildcardRoutes];
            }
        }, [])
        .find(([request, route]) => {
            const matchBy = route.path.split("*")[0];
            return (
                route.method === request.method &&
                request.path.includes(matchBy)
            );
        });
};

const matchVariablePathRoute = (merged: [Request, Route][]) => {
    return merged.reduce(
        (variablePathRoutes: [Request, Route][], [request, route]) => {
            const variableSegments = route.path
                .split("/")
                .reduce((variableSegments: (string | undefined)[], segment) => {
                    const openingBracketIdx = segment.indexOf("{");
                    const closingBrackedIdx = segment.indexOf("}");
                    if (openingBracketIdx !== -1 && closingBrackedIdx !== -1) {
                        return [
                            ...variableSegments,
                            segment.slice(
                                openingBracketIdx + 1,
                                closingBrackedIdx
                            ),
                        ];
                    } else {
                        return [...variableSegments, undefined];
                    }
                }, []);
            const requestSegments = request.path
                .split("/")
                .reduce(
                    (segments: string[], segment) => [...segments, segment],
                    []
                );
            if (variableSegments.length === requestSegments.length) {
                const variables = pairArrayElements(
                    variableSegments,
                    requestSegments
                ).reduce(
                    (
                        variables: Record<string, string>,
                        [vSegment, rSegment]
                    ) => {
                        if (vSegment !== undefined) {
                            return { ...variables, [vSegment]: rSegment };
                        } else {
                            return { ...variables };
                        }
                    },
                    {}
                );
                const requestWithPathVariables: Request = {
                    ...request,
                    pathVariables: variables,
                };
                const pair: [Request, Route] = [
                    requestWithPathVariables,
                    route,
                ];
                return [...variablePathRoutes, pair];
            } else {
                return [...variablePathRoutes];
            }
        },
        []
    )[0];
};

const matchRoute = (request: Request, routes: Route[]) => {
    const merged = mergeRequestAndRoute(request, routes);
    const exactRoute = matchExactRoute(merged);
    if (exactRoute === undefined) {
        const variableRoute = matchVariablePathRoute(merged);
        if (variableRoute === undefined) {
            return matchWildcardRoute(merged);
        } else {
            return variableRoute;
        }
    } else {
        return exactRoute;
    }
};

const writeNotFoundToSocket = (socket: net.Socket) => {
    socket.write(makeResponse(STATUSCODES.NOT_FOUND, [], undefined));
};

const handleNewConnection = (socket: net.Socket, routes: Route[]) => {
    socket.on("data", (buffer) => {
        try {
            const request = parseRequest(buffer.toString("utf8"));
            if (request) {
                const route = matchRoute(request, routes);
                if (route) {
                    const [nRequest, nRoute] = route;
                    nRoute.action(socket, nRequest);
                } else {
                    writeNotFoundToSocket(socket);
                }
            } else {
                writeNotFoundToSocket(socket);
            }
            socket.pipe(socket);
            socket.end();
        } catch (e) {
            console.error(e);
        }
    });
};

const route = (
    method: string,
    path: string,
    action: (socket: net.Socket, request: Request | undefined) => void
): Route => {
    return {
        method,
        path,
        action,
    };
};

const createServer = (hostname: string, port: number, ...routes: Route[]) => {
    new net.Server()
        .listen(port, hostname, undefined, () => {
            console.log(`Server started on ${hostname}:${port}.`);
        })
        .on("connection", (socket: net.Socket) => {
            handleNewConnection(socket, routes);
        });
};

createServer(
    "0.0.0.0",
    8888,
    route(HTTPMethods.GET, "/", (socket) => {
        compose(
            ([file, socket]: [string, net.Socket]) => {
                compose(
                    ([response, socket]: [string, net.Socket]) => {
                        socket.write(response);
                    },
                    ([file, socket]: [string, net.Socket]) => {
                        return [
                            makeResponse(
                                STATUSCODES.OK,
                                [
                                    ["Content-Lenght", file.length.toString()],
                                    ["Content-Type", "text/html"],
                                ],
                                file
                            ),
                            socket,
                        ];
                    }
                )([file, socket]);
            },
            (socket: net.Socket) => {
                return [
                    readFileSync("./websites/index.html", {
                        encoding: "utf8",
                    }),
                    socket,
                ];
            }
        )(socket);
    }),
    route(HTTPMethods.GET, "/*", (socket, request) => {
        compose(
            ([fileContents, socket]: [string, net.Socket]) => {
                compose(
                    ([response, socket]: [string, net.Socket]) => {
                        socket.write(response);
                    },
                    ([file, socket]: [
                        FileContents | undefined,
                        net.Socket,
                        Request
                    ]) => {
                        return [
                            file !== undefined
                                ? makeResponse(
                                      STATUSCODES.OK,
                                      [
                                          [
                                              "Content-Lenght",
                                              file.fileContents.length.toString(),
                                          ],
                                          [
                                              "Content-Type",
                                              file.fileContentType,
                                          ],
                                      ],
                                      file.fileContents
                                  )
                                : makeResponse(
                                      STATUSCODES.NOT_FOUND,
                                      [],
                                      undefined
                                  ),
                            socket,
                        ];
                    }
                )([fileContents, socket]);
            },
            ([socket, request]: [net.Socket, Request | undefined]) => {
                return [
                    request !== undefined
                        ? tryReadFile(request, "/websites")
                        : undefined,
                    socket,
                ];
            }
        )([socket, request]);
    }),
    route(
        HTTPMethods.GET,
        "/test/{variable}/other/{other}",
        (socket, request) => {
            const jsonValue = JSON.stringify(request?.pathVariables);
            compose(
                ([socket, response]: [net.Socket, any]) => {
                    socket.write(response);
                },
                ([socket, jsonValue]: [net.Socket, string]) => {
                    return [
                        socket,
                        makeResponse(
                            STATUSCODES.OK,
                            [
                                ["Content-Lenght", jsonValue.length.toString()],
                                ["Content-Type", "application/json"],
                            ],
                            jsonValue
                        ),
                    ];
                }
            )([socket, jsonValue]);
        }
    )
);
