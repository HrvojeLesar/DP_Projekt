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
        ([response, otherHeaders, body]: [string, [string, string][], any]) => {
            if (
                otherHeaders.find(([field, _]) => {
                    return field === "Content-Type";
                }) &&
                body !== undefined
            ) {
                return response + body;
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

const removeDots = (uri: string) => {
    let inputBuffer = uri;
    const outBuffer: string[] = [];
    // https://www.rfc-editor.org/rfc/rfc3986#section-6.2.3
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

const removeWhitespace = (uri: string) => {
    let whitespaceFreeUri = uri;
    while (whitespaceFreeUri.indexOf(" ") !== -1) {
        whitespaceFreeUri = whitespaceFreeUri.replace(" ", "");
    }
    return whitespaceFreeUri;
};

const normalizeURI = (uri: string): string => {
    return removeDots(removeWhitespace(decodeURI(uri)));
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
        (next: { data: string[]; index: number }) => {
            return next.data.slice(next.index, next.data.length).join("");
        },
        (next: { split: string[] }) => {
            return {
                data: next.split,
                index: next.split.findIndex((line) => line === "") + 1,
            };
        },
        (initialData: string) => {
            return { split: initialData.split("\r\n") };
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
    const lines = data.split("\r\n");
    const methodSplits = lines[0].split(" ");
    const method = methodSplits[0].toLowerCase();
    const uri = normalizeURI(methodSplits[1].toLowerCase());
    const protocolVersion = methodSplits[2];
    const headers = parseHeaders(data);
    switch (method) {
        case HTTPMethods.GET:
        case HTTPMethods.HEAD:
        case HTTPMethods.DELETE:
        case HTTPMethods.CONNECT:
        case HTTPMethods.OPTIONS:
        case HTTPMethods.TRACE:
        case HTTPMethods.PATCH:
            return {
                method,
                path: uri,
                protocolVersion,
                headers,
                payload: undefined,
            };
        case HTTPMethods.POST:
        case HTTPMethods.PUT:
            return {
                method,
                path: uri,
                protocolVersion,
                headers,
                payload: getPayload(headers, data),
            };
        default:
            return undefined;
    }
};

const matchRoute = (request: Request, ...routes: Route[]) => {
    return routes.find((route) => {
        return route.method === request.method && route.path === request.path;
    });
};

const writeNotFoundToSocket = (socket: net.Socket) => {
    socket.write(
        `${statusCodeToString(
            STATUSCODES.NOT_FOUND
        )}\r\nConnection: keep-alive\r\n\r\n`
    );
};

const handleNewConnection = (socket: net.Socket, ...routes: Route[]) => {
    socket.on("data", (buffer) => {
        const data = buffer.toString("utf8");
        const request = parseRequest(data);
        if (request) {
            const route = matchRoute(request, ...routes);
            if (route) {
                route.action(socket, request);
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
            handleNewConnection(socket, ...routes);
        });
};

createServer(
    8888,
    route(HTTPMethods.GET, "/", (socket) => {
        compose(
            (next: { file: string; socket: net.Socket }) => {
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
                )([next.file, socket]);
            },
            (socket: net.Socket) => {
                return {
                    socket,
                    file: readFileSync("test.html", { encoding: "utf8" }),
                };
            }
        )(socket);
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
