import {JDAttachment, JDObject, JDObjectUUID, JDProps, JDResult, JDStore} from "./index.js";
import {openDB, DBSchema, IDBPDatabase, deleteDB} from 'idb';
import "fake-indexeddb/auto";
import {promises as fs} from "fs"
import {IndexedDBImpl} from "./indexeddb-impl.js";
import {NodeJSImpl} from "./node-fs-impl.js";



function p(...args:any[]) {
    console.log(...args)
}



async function make_fresh_db():Promise<JDStore> {
    // let db = new IndexedDBImpl()
    let db = new NodeJSImpl({
        basedir:'fooboo',
        deleteOnExit:true,
    })
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
    let store = await make_fresh_db()
    // insert new doc
    let doc1_uuid = await store.new_object({name:"first doc"})
    assert_eq('doc created',doc1_uuid.success,true)
    let doc2_uuid = await store.new_object({name:"first doc"})
    assert_eq('doc count',(await store.get_all_objects()).data.length,2)
    // insert new node
    let node1_uuid = await store.new_object({name:'first node', docuuid:doc1_uuid, props:{}})
    assert_eq('node count',(await store.get_all_objects()).data.length, 3)
    // @ts-ignore
    await store.destroy()
}

async function create_multiple_docs_test() {
    // reset
    let store = await make_fresh_db()
    // assert_eq('doc count',await store.get_object_cou,0)
    // insert three docs
    await store.new_object({name:'doc1'})
    await store.new_object({name:'doc2'})
    await store.new_object({name:'doc3'})
    // query for the two docs and confirm their names
    let docs:JDResult = await store.get_all_objects()
    assert_eq('success',docs.success,true)
    assert_eq('doc count', docs.data.length,3)
    // @ts-ignore
    await store.destroy()
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
    // console.log('nodev1 result',node1_v1_result)
    let node1_v1:JDObject = node1_v1_result.data[0]
    // console.log('node 1 is',node1_v1)
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
        // console.log("v2 result", node1_v2_result)
        let node1_v2: JDObject = node1_v2_result.data[0]
        // console.log("v2 is", node1_v2)
        // console.log("v1 is", node1_v1)

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
    // @ts-ignore
    await store.destroy()
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
    const store = await make_fresh_db()
    // make an object
    let obj_res = await store.new_object({'type':'image'})
    // p('result of main object',obj_res)
    // make an attachment from a file on disk with the specified mimetype
    let disk_file = "./tsconfig.json"
    let file_stats = await fs.stat(disk_file)
    // p('stats are',file_stats)
    let att_res = await store.new_attachment({mime:'image/pdf'},disk_file)
    // p("att res is",att_res)

    // add attachment to object
    let add_res = await store.add_attachment(obj_res.data[0].uuid,'pdf',att_res.data[0])
    // p("add_res is",add_res.data[0])
    let att_info = add_res.data[0].attachments.pdf
    // p('att info',att_info)

    {
        // get attachment from object
        let get_res = await store.get_attachment(obj_res.data[0].uuid, 'pdf')
        // p("get res is", get_res)
        // confirm data size is correct
        assert_eq('file size correct', get_res.data[0].size, file_stats.size)
        assert_eq('buf size correct', get_res.data[0].blob.length, file_stats.size)
    }
    {
        // get attachment data directly
        // let att_info = add_res.data[0].attachments.pdf
        // console.log('att info',att_info)
        let get_res = await store.get_attachment_data(att_info.uuid)
        // p("get att data is", get_res)
        assert_eq('file size correct', get_res.data[0].size, file_stats.size)
        assert_eq('buf size correct', get_res.data[0].blob.length, file_stats.size)
    }

    {
        // remove attachment from object
        // p("here")
        await store.remove_attachment(obj_res.data[0].uuid,'pdf')
        // p("there")

        // confirm attachment removed from object
        let get_res = await store.get_attachment(obj_res.data[0].uuid, 'pdf')
        // p("get res is", get_res)
        assert_eq('no attachment ref left on object',get_res.success,false)

        // get data from raw attachment directly
        let get_att = await store.get_attachment_data(att_info.uuid)
        // confirm data size is correct
        assert_eq('file size correct', get_att.data[0].size, file_stats.size)
        assert_eq('buf size correct', get_att.data[0].blob.length, file_stats.size)
    }
    // destroy
    // @ts-ignore
    store.destroy()
}

async function test_docs() {
    await create_node_test()
    await create_multiple_docs_test()
    await node_versioning_test()
    // await doc_list_test()
    // await image_attachments_test()
}
test_docs().catch(e => console.error(e))

