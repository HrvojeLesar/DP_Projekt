import net from "net";

type Request = {
    method: string;
    path: string;
    protocolVersion: string;
    headers: any;
    payload: any;
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
    // TODO: missing sanitazation of relative directory paths like ~
    return removeDots(removeWhitespace(decodeURI(uri)));
};

const parseRequest = (data: String): Request | string | undefined => {
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
            return {
                method,
                path: uri,
                protocolVersion,
                headers: undefined,
                payload: undefined,
            };
        default:
            return "INVALID METHOD";
    }
};

const parseHeaders = (data: String) => {
    const headers: any = {};
    data.split("\r\n").forEach((line) => {
        const split = line.split(":");
        const field = split[0];
    });
};

const handleNewConnection = (socket: net.Socket) => {
    socket.on("data", (buffer) => {
        const data = buffer.toString("utf8");
        const method = parseRequest(data);
        console.log(method);
        // const headers =
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
