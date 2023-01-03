import { readFileSync } from "fs";
import net from "net";

type RequestHeaders = Map<string, string>;

type Request = {
    method: string;
    path: string;
    protocolVersion: string;
    headers: RequestHeaders | undefined;
    payload: any;
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

const tryReadFile = (request: Request): FileContents | undefined => {
    try {
        const fileContents = readFileSync(`.${request.path}`);
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

// TODO: Not functional, change to functional approach
// https://www.rfc-editor.org/rfc/rfc3986#section-6.2.3
const removeDots = (uri: string) => {
    let inputBuffer = uri;
    const outBuffer: string[] = [];
    while (inputBuffer.length > 0) {
        if (inputBuffer.indexOf("../") === 0) {
            // A
            inputBuffer = inputBuffer.replace("../", "");
        } else if (inputBuffer.indexOf("./") === 0) {
            // A
            inputBuffer = inputBuffer.replace("./", "");
        } else if (inputBuffer.indexOf("/./") === 0) {
            // B
            inputBuffer = inputBuffer.replace("/./", "/");
        } else if (inputBuffer.indexOf("/.") === 0) {
            // B
            inputBuffer = inputBuffer.replace("/.", "/");
        } else if (inputBuffer.indexOf("/../") === 0) {
            // C
            inputBuffer = inputBuffer.replace("/../", "/");
            outBuffer.pop();
        } else if (inputBuffer.indexOf("/..") === 0) {
            // C
            inputBuffer = inputBuffer.replace("/..", "/");
            outBuffer.pop();
        } else if (inputBuffer.indexOf("..") === 0) {
            // D
            inputBuffer = inputBuffer.replace("..", "");
        } else if (inputBuffer.indexOf(".") === 0) {
            // D
            inputBuffer = inputBuffer.replace(".", "");
        } else {
            const part = inputBuffer.substring(0, inputBuffer.indexOf("/", 1));
            outBuffer.push(part !== "" ? part : inputBuffer);
            inputBuffer = part !== "" ? inputBuffer.replace(part, "") : "";
        }
    }
    return outBuffer.join("");
};

// WARN: Not a functional function, has mutation
const removeWhitespace = (uri: string) => {
    let whitespaceFreeUri = uri;
    while (whitespaceFreeUri.indexOf(" ") !== -1) {
        whitespaceFreeUri = whitespaceFreeUri.replace(" ", "");
    }
    return whitespaceFreeUri;
};

const normalizeURI = (uri: string): string => {
    return compose(removeDots, removeWhitespace, decodeURI)(uri);
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
            acc.set(field, value);
            return acc;
        }, new Map());
};

const getPayload = (headers: RequestHeaders, data: string) => {
    const contentType = headers.get("content-type");
    if (contentType === undefined) {
        return undefined;
    }
    const payload = compose(
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
        // TODO: handle url encoded
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
            };
        case HTTPMethods.POST:
        case HTTPMethods.PUT:
            return {
                method: method.toLowerCase(),
                path: normalizeURI(uri),
                protocolVersion,
                headers,
                payload: getPayload(headers, data),
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

const matchRoute = (request: Request, routes: Route[]) => {
    const merged = mergeRequestAndRoute(request, routes);
    const route = matchExactRoute(merged);
    if (route === undefined) {
        return matchWildcardRoute(merged);
    }
    return route;
};

const writeNotFoundToSocket = (socket: net.Socket) => {
    socket.write(makeResponse(STATUSCODES.NOT_FOUND, [], undefined));
};

const handleNewConnection = (socket: net.Socket, routes: Route[]) => {
    socket.on("data", (buffer) => {
        const request = parseRequest(buffer.toString("utf8"));
        if (request) {
            const route = matchRoute(request, routes);
            if (route) {
                route[1].action(socket, request);
            } else {
                writeNotFoundToSocket(socket);
            }
        } else {
            writeNotFoundToSocket(socket);
        }
        socket.pipe(socket);
        socket.end();
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

const createServer = (port: number, ...routes: Route[]) => {
    new net.Server()
        .listen(port, "localhost", undefined, () => {
            console.log(`Server started... on port: ${port}`);
        })
        .on("connection", (socket: net.Socket) => {
            handleNewConnection(socket, routes);
        });
};

createServer(
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
                    readFileSync("./index.html", {
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
                    request !== undefined ? tryReadFile(request) : undefined,
                    socket,
                ];
            }
        )([socket, request]);
    }),
    route(HTTPMethods.POST, "/", (socket, request) => {
        if (request) {
            console.log("Payload:", request.payload);
        }
        socket.write(
            "HTTP/1.1 200 Ok\r\nServer: DP_PROJEKT\r\nContent-Type: text/html\r\nContent-Length: 25\r\n\r\n<html>Hello World!</html>"
        );
    })
);
