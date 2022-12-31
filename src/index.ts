export type JDProps = Record<string,any>;
export type JDObjectUUID = string
export type JDAttachment = {
    uuid:JDObjectUUID, // UUID just for the attachment
    size:number, // size in bytes
    mime:string, // mime type. should be one of the valid mimetypes
    props:JDProps,
}
export type JDObject = {
    uuid:string,
    version:number,
    props:JDProps,
    atts:Record<string,JDAttachment>,
    deleted:boolean,
}

export type JDResult = {
    success:boolean
    data:any[]
}

export interface JDStore {
    // make a new object with no parent object
    new_object(props?:JDProps):Promise<JDResult>,
    // make an object that is a new version of a previous object
    version_object(source_id:JDObjectUUID,props?:JDProps):Promise<JDResult>
    // make a new object that is a new version of a previous object, but with different props
    update_object_props(object_id:JDObjectUUID, props?:JDProps):Promise<JDResult>
    // delete the object. marks as deleted. history can still be retrieved
    delete_object(object_id:JDObjectUUID):Promise<JDResult>
    // make an attachment
    new_attachment(props:JDProps, opaque:any):Promise<JDResult>
    // add existing attachment to an object by name
    add_attachment(object_id:JDObjectUUID, name:string, att_id:JDObjectUUID):Promise<JDResult>
    // remove attachment from an object by name
    remove_attachment(object_id:JDObjectUUID, name:string):Promise<JDResult>

    // get new-est version of the specified object
    get_object(object_id:JDObjectUUID):Promise<JDResult>
    // get specific object by specific version
    get_object_by_version(object_id:JDObjectUUID, version:number):Promise<JDResult>

    get_all_objects():Promise<JDResult>

    get_object_versions(node1_result: JDResult): Promise<JDResult>;
}


/*
- make new object
- make new object with props
- make new object from previous object with props
- delete object
- add attachment to object from stream and props by name
- add attachment (using implementation specific props, like local file paths)
- remove attachment from object by name
- delete attachment completely?
    - get complete history of object
- get newest version of a list of all objects marked as ‘document’ and render their names.
- open datastore (uses implementation specific parameters)
- new is the same as open
- export datastore (uses implementation specific parameters)
 */
