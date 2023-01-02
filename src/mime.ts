import path from "path";

export function detect_mime(buff: Buffer, opaque: any, mime: any) {
    if (mime) return mime
    if (typeof opaque === 'string') {
        let ext = path.extname(opaque)
        if (ext === '.json') {
            return "application/json"
        }
    }
    return "application/unknown"
}
