const EXT_TO_MIME = {
    ".json":'application/json',
    ".pdf":"image/pdf"
}
export function detect_mime(buff: Buffer, opaque: any, mime: any) {
    if (mime) return mime
    if (typeof opaque === 'string') {
        let n = opaque.lastIndexOf('.')
        if(n > 0) {
            let ext = opaque.substring(n)
            if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext]
        }
    }
    return "application/unknown"
}
