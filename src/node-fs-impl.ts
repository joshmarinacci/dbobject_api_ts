import {promises as fs} from "fs"
import path from "path"
import {JDAttachment, JDObject, JDObjectUUID, JDProps, JDResult, JDStore} from "./index.js";
import {detect_mime} from "./mime.js";

type NodeJSImplArgs = {
    basedir:string,
    deleteOnExit:boolean,
}

async function mkdir_or_skip(basedir: string) {
    try {
        console.log("making",basedir)
        await fs.mkdir(basedir)
    } catch (e) {
        // console.error(e)
    }
}
function gen_id(prefix: string):string {
    return `${prefix}_${Math.floor(Math.random()*1_000_0000)}`
}

export class NodeJSImpl implements JDStore {
    private basedir: string;
    private deleteOnExit: boolean;
    private objsdir: string;
    private attsdir: string;
    private objects: Map<string,JDObject[]>
    private attachments: Map<string,JDAttachment>
    constructor(opts:NodeJSImplArgs) {
        this.basedir = opts.basedir
        this.objsdir = path.join(this.basedir,'objects')
        this.attsdir = path.join(this.basedir,'attachments')
        this.deleteOnExit = opts.deleteOnExit
        this.objects = new Map()
        this.attachments = new Map()
    }
    async open() {
        await mkdir_or_skip(this.basedir)
        await mkdir_or_skip(this.objsdir)
        await mkdir_or_skip(this.attsdir)
        console.log('done')
    }

    async destroy() {
        if(this.deleteOnExit) {
            try {
                await fs.rm(this.basedir, {recursive: true, force: true})
            } catch (e) {
                console.error(e)
            }
        }
    }



    async new_object(props?: JDProps): Promise<JDResult> {
        let obj:JDObject = {uuid: gen_id('node'), version: 0, props:props, atts:{}, deleted:false}
        let new_obj:JDObject = await this._persist(obj)
        if(!this.objects.has(new_obj.uuid)) {
            this.objects.set(new_obj.uuid,[])
        }
        this.objects.get(new_obj.uuid).push(new_obj)
        return {
            success:true,
            data:[new_obj],
        }
    }
    async get_object(object_id: JDObjectUUID): Promise<JDResult> {
        let arr = this.objects.get(object_id)
        return {
            success:true,
            data:[arr[arr.length-1]]
        }
    }
    async get_object_by_version(object_id: JDObjectUUID, version: number): Promise<JDResult> {
        console.log("looking up",object_id,version)
        let arr = this.objects.get(object_id)
        let found = arr.find(a => a.version === version)
        if(found) {
            return {
                success:true,
                data:[found]
            }
        } else {
            return {
                success:false,
                data:[]
            }
        }
    }
    async get_object_versions(object_id: JDObjectUUID): Promise<JDResult> {
        let arr = this.objects.get(object_id)
        return {
            success:true,
            data:arr,
        }
    }
    async update_object_props(object_id: JDObjectUUID, props?: JDProps): Promise<JDResult> {
        let prev_obj_ret = await this.get_object(object_id)
        let prev_obj = prev_obj_ret.data[0]
        let new_obj = JSON.parse(JSON.stringify(prev_obj))
        if(props) {
            Object.keys(props).forEach(name => {
                new_obj.props[name] = props[name]
            })
        }
        new_obj.version = prev_obj.version+1
        let new_obj2 = await this._persist(new_obj)
        if(!this.objects.has(new_obj2.uuid)) {
            this.objects.set(new_obj2.uuid,[])
        }
        this.objects.get(new_obj2.uuid).push(new_obj2)
        return {
            success:true,
            data:[new_obj2]
        }
    }



    delete_object(object_id: JDObjectUUID): Promise<JDResult> {
        return this.not_implemented()
    }

    async get_all_objects(): Promise<JDResult> {
        return {
            success:true,
            data:Array.from(this.objects.keys())
        }
    }

    async new_attachment(props: JDProps, opaque: any): Promise<JDResult> {
        let buff = await fs.readFile(opaque)
        let att:JDAttachment = {
            uuid: gen_id('attachment'),
            mime: detect_mime(buff,opaque,props.mime),
            props: {},
            size: buff.length,
        }
        if(props) Object.keys(props).forEach(name => {
            att.props[name] = props[name]
        })
        let new_att = await this._persist_attr(att,buff)
        this.attachments.set(att.uuid,att)
        return {
            success:true,
            data:[new_att]
        }
    }
    async get_attachment_data(att_id: JDObjectUUID): Promise<JDResult> {
        let att = this.attachments.get(att_id)
        if(!att) return { success:false, data:[]}
        let buf = await fs.readFile(path.join(this.attsdir,att_id,'blob'))
        return {
            success:true,
            // @ts-ignore
            data:buf
        }
    }
    async add_attachment(object_id: JDObjectUUID, name: string, att: JDAttachment): Promise<JDResult> {
        let prev_obj_ret = await this.get_object(object_id)
        let prev_obj = prev_obj_ret.data[0]
        let new_obj:JDObject = JSON.parse(JSON.stringify(prev_obj))
        new_obj.version = prev_obj.version+1
        let att_ref:JDAttachment = {
            uuid:att.uuid,
            mime:att.mime,
            props:{},
            size:att.size
        };
        new_obj.atts[name] = att_ref
        console.log('adding attribute ref',att_ref)
        let new_obj2 = await this._persist(new_obj)
        if(!this.objects.has(new_obj2.uuid)) {
            this.objects.set(new_obj2.uuid,[])
        }
        this.objects.get(new_obj2.uuid).push(new_obj2)
        return {
            success:true,
            data:[new_obj2],
        }
    }
    async get_attachment(object_id: JDObjectUUID, name: string): Promise<JDResult> {
        let obj = await this.get_object(object_id)
        console.log("obj res is",obj.data[0])
        let att = obj.data[0].atts[name]
        if(!att) return {success:false, data:[]}
        console.log('att is',att)
        return {
            success:true,
            data:[att]
        }
    }
    async remove_attachment(object_id: JDObjectUUID, name: string): Promise<JDResult> {
        let prev_obj_ret = await this.get_object(object_id)
        let prev_obj = prev_obj_ret.data[0]
        let new_obj:JDObject = JSON.parse(JSON.stringify(prev_obj))
        new_obj.version = prev_obj.version+1
        console.log('removed attribute ref',new_obj.atts[name])
        delete new_obj.atts[name]
        let new_obj2 = await this._persist(new_obj)
        if(!this.objects.has(new_obj2.uuid)) {
            this.objects.set(new_obj2.uuid,[])
        }
        this.objects.get(new_obj2.uuid).push(new_obj2)
        return {
            success:true,
            data:[new_obj2],
        }
    }


    version_object(source_id: JDObjectUUID, props?: JDProps): Promise<JDResult> {
        return this.not_implemented()
    }

    private not_implemented():Promise<JDResult> {
        throw new Error("not implemented")
    }

    private async _persist(obj: JDObject):Promise<JDObject> {
        let str = JSON.stringify(obj,null,'   ');
        let pth = path.join(this.objsdir,obj.uuid)
        await mkdir_or_skip(pth)
        await fs.writeFile(path.join(pth,obj.version+'.json'),str)
        let raw = await fs.readFile(path.join(pth,obj.version+'.json'))
        return JSON.parse(raw.toString())
    }

    private async _persist_attr(att: JDAttachment, buff: Buffer) {
        let str = JSON.stringify(att, null, '   ');
        let pth = path.join(this.attsdir, att.uuid)
        await mkdir_or_skip(pth)
        await fs.writeFile(path.join(pth, 'attr.json'), str)
        await fs.writeFile(path.join(pth, 'blob'),buff)
        let raw = await fs.readFile(path.join(pth, 'attr.json'))
        return JSON.parse(raw.toString())

    }
}