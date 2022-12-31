import net from "net";

type Request = {
    method: string;
    path: string;
    protocolVersion: string;
    headers: any;
    payload: any;
};

type StatusCode = {
    code: number;
    response: string;
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
    return unparsedHeaders.slice(1, headersEnd).reduce((acc: any, line) => {
        const colonIndex = line.indexOf(":");
        const field = line.substring(0, colonIndex).toLowerCase();
        const value = line.substring(colonIndex + 1, line.length).trim();
        acc[field] = value;
        return acc;
    }, {});
};

const getPayload = (headers: any, data: string) => {
    const contentType = headers["content-type"];
    if (contentType === undefined) {
        return undefined;
    }
    const lines = data.split("\r\n");
    const bodyBeginIndex = lines.findIndex((line) => line === "") + 1;
    if (contentType === "application/json") {
        return JSON.parse(lines.slice(bodyBeginIndex, lines.length).join(""));
    } else if (contentType === "application/x-www-form-urlencoded") {
        // TODO: handle url encoded
    } else if (contentType === "text/plain") {
        // TODO: handle plaintext
    }
};

const parseRequest = (data: string): Request | undefined => {
    const lines = data.split("\r\n");
    const methodSplits = lines[0].split(" ");
    const method = methodSplits[0].toLowerCase();
    const uri = normalizeURI(methodSplits[1].toLowerCase());
    const protocolVersion = methodSplits[2];
    switch (method) {
        case "get":
        case "head":
        case "post":
        case "put":
        case "delete":
        case "connect":
        case "options":
        case "trace":
        case "patch":
            const headers = parseHeaders(data);
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

const handleNewConnection = (socket: net.Socket) => {
    socket.on("data", (buffer) => {
        const data = buffer.toString("utf8");
        const request = parseRequest(data);
        if (request) {
            socket.write(
                "HTTP/1.1 200 Ok\r\nServer: DP_PROJEKT\r\nContent-Type: text/html\r\nContent-Length: 25\r\n\r\n<html>Hello World!</html>"
            );
        } else {
            socket.write(statusCodeToString(STATUSCODES.BAD_REQUEST));
        }
        socket.pipe(socket);
        socket.end();
    });
};

const createServer = () => {
    const port = 42069;
    new net.Server()
        .listen(port, "localhost", undefined, () => {
            console.log(`Server started... on port: ${port}`);
        })
        .on("connection", handleNewConnection);
};

createServer();
