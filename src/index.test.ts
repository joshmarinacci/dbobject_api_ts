import {JDObject, JDObjectUUID, JDProps, JDResult, JDStore} from "./index.js";
import {openDB, DBSchema, IDBPDatabase, deleteDB} from 'idb';
import "fake-indexeddb/auto";

function gen_id(prefix: string):string {
    return `${prefix}_${Math.floor(Math.random()*1_000_0000)}`
}

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
            foo:string
        }
    }
}

function p(...args:any[]) {
    console.log(...args)
}

class IndexedDBImpl implements JDStore {
    private db: any;
    constructor() {
    }
    async open():Promise<JDResult> {
        this.db = await openDB<JDSchema>(gen_id('myid'), 1, {
            upgrade(db) {
                console.log("upgrade called")
                const node_store = db.createObjectStore('nodes', {
                    keyPath: 'dbid',
                    autoIncrement: true,
                });
                node_store.createIndex('by-uuid', 'uuid');
                const atts_store = db.createObjectStore('attachments', {
                    // keyPath: 'productCode',
                });
            },
        });
        return {
            success: true,
            data: [],
        }

    }
    async destroy() {
        await deleteDB("my-db")
    }
    add_attachment(object_id: JDObjectUUID, name: string, att_id: JDObjectUUID): Promise<JDResult> {
        return Promise.resolve(undefined);
    }

    delete_object(object_id: JDObjectUUID): Promise<JDResult> {
        return Promise.resolve(undefined);
    }

    async get_object(object_id: JDObjectUUID): Promise<JDResult> {
        let arr = await this.db.getAllFromIndex('nodes','by-uuid',object_id)
        // console.log("returned obj",arr)
        let fin = arr.reduce((a,b)=>{
            if(b.version > a.version) return b
            return a
        })
        // console.log("fin is",fin)
        return {
            success:true,
            data:[fin]
        }
    }

    async get_object_by_version(object_id: JDObjectUUID, version: number): Promise<JDResult> {
        let arr = await this.db.getAllFromIndex('nodes','by-uuid',object_id)
        p("all versions of",object_id,'are',arr)
        let a = arr.find(a => a.version === version)
        p("found a",a)
        return {
            success:true,
            data:[a],
        }
    }
    async get_object_versions(object_id:JDObjectUUID): Promise<JDResult> {
        p("getting all versions of", object_id)
        let arr = await this.db.getAllFromIndex('nodes','by-uuid',object_id)
        return {
            success:true,
            data:arr,
        }
    }

    new_attachment(props: JDProps, opaque: any): Promise<JDResult> {
        return Promise.resolve(undefined);
    }

    async new_object(props?: JDProps): Promise<JDResult> {
        let obj = {uuid: gen_id('node'), version: 0, props:props}
        let id = await this.db.add('nodes', obj)
        let new_obj = await this.db.get('nodes',id)
        return {
            success:true,
            data:[new_obj],
        }
    }

    remove_attachment(object_id: JDObjectUUID, name: string): Promise<JDResult> {
        return Promise.resolve(undefined);
    }

    async update_object_props(object_id: JDObjectUUID, props?: JDProps): Promise<JDResult> {
        let prev_obj_ret = await this.get_object(object_id)
        let prev_obj = prev_obj_ret.data[0]
        p("old is",prev_obj)
        let new_obj = JSON.parse(JSON.stringify(prev_obj))
        if(props) {
            Object.keys(props).forEach(name => {
                p("updating",name, props[name])
                new_obj.props[name] = props[name]
            })
        }
        new_obj.version = prev_obj.version+1
        delete new_obj.dbid
        p("new obj is",new_obj)
        let id = await this.db.add('nodes', new_obj)
        let new_obj2 = await this.db.get('nodes',id)
        p('new obj 2',new_obj2)
        return {
            success:true,
            data:[new_obj2]
        }
    }

    version_object(source_id: JDObjectUUID, props?: JDProps): Promise<JDResult> {
        return Promise.resolve(undefined);
    }

    async get_all_objects(): Promise<JDResult> {
        let result = await this.db.getAll('nodes')
        return {
            success:true,
            data:result
        }
    }

}

async function make_fresh_db():Promise<IndexedDBImpl> {
    let db = new IndexedDBImpl()
    await db.open()
    return db
}

function equals_any<V>(a:V,b:V) {
    if(Array.isArray(a) && Array.isArray(b)) {
        return equals_array(a as any[],b as any[])
    }
    return (a === b)
}
function equals_array(a1: any[], b1: any[]):boolean {
    if(a1.length !== b1.length) return false
    for(let i=0; i<a1.length; i++) {
        let a = a1[i]
        let b = b1[i]
        if(!equals_any(a,b)) return false
    }
    return true
}
function assert_eq<V>(message:string, a:V, b:V) {
    let matched = equals_any(a,b)
    if(!matched) {
        console.error(`${message} failed`)
        console.error(a)
        console.error('not equal to')
        console.error(b)
        throw new Error(`${message}`)
    }
    console.info("PASSED:", message)
}


async function create_node_test() {
    let store:IndexedDBImpl = await make_fresh_db() as unknown as IndexedDBImpl
    // insert new doc
    let doc1_uuid = await store.new_object({name:"first doc"})
    assert_eq('doc created',doc1_uuid.success,true)
    let doc2_uuid = await store.new_object({name:"first doc"})
    assert_eq('doc count',(await store.get_all_objects()).data.length,2)
    // insert new node
    let node1_uuid = await store.new_object({name:'first node', docuuid:doc1_uuid, props:{}})
    assert_eq('node count',(await store.get_all_objects()).data.length, 3)
    store.destroy()
}

async function create_multiple_docs_test() {
    // reset
    let store:IndexedDBImpl = await make_fresh_db() as unknown as IndexedDBImpl
    // assert_eq('doc count',await db.get_doc_count(),0)
    // insert three docs
    await store.new_object({name:'doc1'})
    await store.new_object({name:'doc2'})
    await store.new_object({name:'doc3'})
    // query for the two docs and confirm their names
    let docs:JDResult = await store.get_all_objects()
    assert_eq('success',docs.success,true)
    assert_eq('doc count', docs.data.length,3)
    store.destroy()
}

async function node_versioning_test() {
    // reset
    let store = await make_fresh_db()

    // insert new doc with two nodes
    let doc_result = await store.new_object({name:'doc1'})
    let node1_result = await store.new_object({
        docuuid:doc_result.data[0].uuid,
        name:'node1',
        simpson:'bart'})
    await store.new_object({
        docuuid:doc_result.data[0].uuid,
        name:'node2',
        'simpson':'homer',
    })
    // three objects total
    assert_eq('doc count',(await store.get_all_objects()).data.length,3)

    // fetch first node
    let node1_v1_result = await store.get_object(node1_result.data[0].uuid)
    console.log('nodev1 result',node1_v1_result)
    let node1_v1:JDObject = node1_v1_result.data[0]
    console.log('node 1 is',node1_v1)
    let bart_uuid = node1_v1.uuid
    assert_eq('node name',node1_v1.props.name,'node1')
    assert_eq('node prop simpson',node1_v1.props.simpson,'bart')
    assert_eq('node doc uuid',node1_v1.props.docuuid,doc_result.data[0].uuid)


    {
        // update the node with some property
        // save back first node
        await store.update_object_props(bart_uuid, {simpson:'lisa'})

        // // fetch full doc and nodes
        let node1_v2_result = await store.get_object(bart_uuid)
        console.log("v2 result", node1_v2_result)
        let node1_v2: JDObject = node1_v2_result.data[0]
        console.log("v2 is", node1_v2)
        console.log("v1 is", node1_v1)

        // // confirm first node has the new value
        assert_eq('node prop simpson changed', node1_v2.props.simpson, 'lisa')
    }

    {
        // // fetch history of first node
        let history: JDResult = await store.get_object_versions(bart_uuid)
        assert_eq('node history count', history.data.length, 2)
        // confirm old node still has the right value
        let old_node1_result: JDResult = await store.get_object_by_version(bart_uuid, 0)
        assert_eq('node previous value', old_node1_result.data[0].props.simpson, 'bart')
        // confirm new node still has the right value
        let old_node2_result: JDResult = await store.get_object_by_version(bart_uuid, 1)
        assert_eq('node previous value', old_node2_result.data[0].props.simpson, 'lisa')
    }
    //
    // let size = await store.get_total_size_bytes()
    // log.info('total size is',size)
    store.destroy()
}

// async function doc_list_test() {
//     let db = await make_fresh_db()
//     assert_eq('doc count',await db.get_doc_count(),0)
//     // insert three docs
//     await db.make_doc({name:'doc1'})
//     await db.make_doc({name:'doc2'})
//     await db.make_doc({name:'doc3'})
//     // query for the two docs and confirm their names
//     let docs = await db.get_all_docs()
//     log.info("foo hoo ==========")
//     let names = docs.map(d => d.name)
//     assert_eq('doc names',names,['doc1','doc2','doc3'])
//
//     assert_eq('doc count',await db.get_doc_count(),3)
//
// }

async function image_attachments_test() {
    //make fresh db
    const store:IndexedDBImpl = await make_fresh_db() as unknown as IndexedDBImpl
    // make an object
    // make an attachment from a file on disk with the specified mimetype
    // add attachment to object
    // get attachment from object
    // get data from attachment
    // confirm data size is correct
    // remove attachment from object
    // get data from attachment
    // confirm data size is correct
    // destroy
    store.destroy()
}

async function test_docs() {
    await create_node_test()
    await create_multiple_docs_test()
    await node_versioning_test()
    // await doc_list_test()
    await image_attachments_test()
}
test_docs().catch(e => console.error(e))

