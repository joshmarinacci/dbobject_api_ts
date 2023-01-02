import {JDAttachment, JDObjectUUID, JDProps, JDResult, JDStore} from "./index.js";
import {DBSchema, deleteDB, openDB} from "idb";
import {promises as fs} from "fs";
import {detect_mime} from "./mime.js";

const NODES = 'nodes'
const ATTACHMENTS = 'attachments'
const BY_UUID = 'by-uuid'
interface JDSchema extends DBSchema {
    nodes: {
        key: number
        value: {
            uuid:string
            version:number
            props:Record<string,any>,
        };
        indexes:{'by-uuid':string}
    }
    attachments: {
        key:string
        value: {
            uuid:string
        },
        indexes:{'by-uuid':string}
    }
}

function gen_id(prefix: string):string {
    return `${prefix}_${Math.floor(Math.random()*1_000_0000)}`
}

function p(...args:any[]) {
    console.log(...args)
}

export class IndexedDBImpl implements JDStore {
    private db: any;
    constructor() {
    }
    async open():Promise<void> {
        this.db = await openDB<JDSchema>(gen_id('myid'), 1, {
            upgrade(db) {
                console.log("upgrade called")
                const node_store = db.createObjectStore(NODES, {
                    keyPath: 'dbid',
                    autoIncrement: true,
                });
                node_store.createIndex(BY_UUID, 'uuid');
                const atts_store = db.createObjectStore(ATTACHMENTS, {
                    keyPath: 'dbid',
                    autoIncrement: true,
                });
                atts_store.createIndex(BY_UUID, 'uuid');
            },
        });
    }
    async destroy() {
        await deleteDB("my-db")
    }
    async add_attachment(object_id: JDObjectUUID, name: string, att: JDAttachment): Promise<JDResult> {
        let prev_obj_ret = await this.get_object(object_id)
        let prev_obj = prev_obj_ret.data[0]
        let new_obj = JSON.parse(JSON.stringify(prev_obj))
        new_obj.version = prev_obj.version+1
        let att_ref:JDAttachment = {
            uuid:att.uuid,
            mime:att.mime,
            props:{},
            size:att.size
        };
        new_obj.attachments[name] = att_ref
        delete new_obj.dbid
        let id = await this.db.add(NODES, new_obj)
        let new_obj2 = await this.db.get(NODES,id)
        return {
            success:true,
            data:[new_obj2],
        }
    }

    async get_attachment(object_id:JDObjectUUID, name:string):Promise<JDResult> {
        let prev_obj_ret = await this.get_object(object_id)
        if(!prev_obj_ret.data[0].attachments[name]) {
            return {
                success:false,
                data:[],
            }
        }
        let att_info:JDAttachment = prev_obj_ret.data[0].attachments[name]
        // p("att id is",att_info)
        let arr = await this.db.getAllFromIndex(ATTACHMENTS,BY_UUID,att_info.uuid)
        // p("att is",arr)
        return {
            success:true,
            data:arr,
        }
    }

    async get_attachment_data(att_id:JDObjectUUID):Promise<JDResult> {
        // p("att id is",att_id)
        let arr = await this.db.getAllFromIndex(ATTACHMENTS,BY_UUID,att_id)
        // p("att is",arr)
        return {
            success:true,
            data:arr,
        }
    }

    async remove_attachment(object_id: JDObjectUUID, name: string): Promise<JDResult> {
        let prev_obj_ret = await this.get_object(object_id)
        let prev_obj = prev_obj_ret.data[0]
        let new_obj = JSON.parse(JSON.stringify(prev_obj))
        new_obj.version = prev_obj.version+1
        delete new_obj.attachments[name]
        delete new_obj.dbid
        let id = await this.db.add(NODES, new_obj)
        let new_obj2 = await this.db.get(NODES,id)
        return {
            success:true,
            data:[new_obj2],
        }
    }

    delete_object(object_id: JDObjectUUID): Promise<JDResult> {
        return Promise.resolve(undefined);
    }

    async get_object(object_id: JDObjectUUID): Promise<JDResult> {
        let arr = await this.db.getAllFromIndex(NODES,BY_UUID,object_id)
        let fin = arr.reduce((a,b)=> b.version > a.version ? b : a)
        return {
            success:true,
            data:[fin]
        }
    }

    async get_object_by_version(object_id: JDObjectUUID, version: number): Promise<JDResult> {
        let arr = await this.db.getAllFromIndex(NODES,BY_UUID,object_id)
        let a = arr.find(a => a.version === version)
        return {
            success:true,
            data:[a],
        }
    }
    async get_object_versions(object_id:JDObjectUUID): Promise<JDResult> {
        let arr = await this.db.getAllFromIndex(NODES,BY_UUID,object_id)
        return {
            success:true,
            data:arr,
        }
    }

    async new_attachment(props: JDProps, opaque: any): Promise<JDResult> {
        let buff = await fs.readFile(opaque)
        // p("buffer is",buff.toString())
        let att:JDAttachment = {
            uuid: gen_id('attachment'),
            mime: detect_mime(buff,opaque,props.mime),
            props: {},
            size: buff.length,
        }
        if(props) Object.keys(props).forEach(name => {
            att.props[name] = props[name]
        })
        // @ts-ignore
        att.blob = buff
        let id = await this.db.add(ATTACHMENTS, att)
        let new_att = await this.db.get(ATTACHMENTS,id)
        return {
            success:true,
            data:[new_att]
        }
    }

    async new_object(props?: JDProps): Promise<JDResult> {
        let obj = {uuid: gen_id('node'), version: 0, props:props, attachments:{}}
        let id = await this.db.add(NODES, obj)
        let new_obj = await this.db.get(NODES,id)
        return {
            success:true,
            data:[new_obj],
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
        delete new_obj.dbid
        let id = await this.db.add(NODES, new_obj)
        let new_obj2 = await this.db.get(NODES,id)
        return {
            success:true,
            data:[new_obj2]
        }
    }

    version_object(source_id: JDObjectUUID, props?: JDProps): Promise<JDResult> {
        return Promise.resolve(undefined);
    }

    async get_all_objects(): Promise<JDResult> {
        let result = await this.db.getAll(NODES)
        return {
            success:true,
            data:result
        }
    }

}
