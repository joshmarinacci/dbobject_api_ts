import {
  JDAttachment,
  JDObject,
  JDObjectUUID,
  JDProps,
  JDQuery,
  JDResult,
  JDStore,
} from "./index.js";
import { DBSchema, deleteDB, openDB } from "idb";
import { detect_mime } from "./mime.js";
import { match_query } from "./query.js";

const NODES = "nodes";
const ATTACHMENTS = "attachments";
const BY_UUID = "by-uuid";
interface JDSchema extends DBSchema {
  nodes: {
    key: number;
    value: {
      uuid: string;
      version: number;
      props: Record<string, any>;
    };
    indexes: { "by-uuid": string };
  };
  attachments: {
    key: string;
    value: {
      uuid: string;
    };
    indexes: { "by-uuid": string };
  };
}

function gen_id(prefix: string): string {
  return `${prefix}_${Math.floor(Math.random() * 1_000_0000)}`;
}

function p(...args: any[]) {
  console.log(...args);
}

export class IndexedDBImpl implements JDStore {
  private db: any;
  private db_name: string;
  constructor() {}
  async open(): Promise<void> {
    this.db_name = "my-db";
    this.db = await openDB<JDSchema>(this.db_name, undefined, {
      upgrade(db) {
        console.log("upgrade called");
        const node_store = db.createObjectStore(NODES, {
          keyPath: "dbid",
          autoIncrement: true,
        });
        node_store.createIndex(BY_UUID, "uuid");
        const atts_store = db.createObjectStore(ATTACHMENTS, {
          keyPath: "dbid",
          autoIncrement: true,
        });
        atts_store.createIndex(BY_UUID, "uuid");
      },
      blocked(
        currentVersion: number,
        blockedVersion: number | null,
        event: IDBVersionChangeEvent,
      ) {
        console.log("blocked");
      },
      blocking(
        currentVersion: number,
        blockedVersion: number | null,
        event: IDBVersionChangeEvent,
      ) {
        console.log("blocking", currentVersion, blockedVersion, event);
      },
      terminated() {
        console.log("terminated");
      },
    });
  }
  async destroy() {
    console.log("destroying db");
    await deleteDB(this.db_name, {
      blocked(currentVersion: number, event: IDBVersionChangeEvent) {
        console.log("blocked", currentVersion, event);
      },
    });
  }
  async add_attachment(
    object_id: JDObjectUUID,
    name: string,
    att: JDAttachment,
  ): Promise<JDResult> {
    let prev_obj_ret = await this.get_object(object_id);
    let prev_obj = prev_obj_ret.data[0];
    let new_obj = JSON.parse(JSON.stringify(prev_obj));
    new_obj.version = prev_obj.version + 1;
    let att_ref: JDAttachment = {
      uuid: att.uuid,
      mime: att.mime,
      props: {},
      size: att.size,
    };
    new_obj.atts[name] = att_ref;
    delete new_obj.dbid;
    let id = await this.db.add(NODES, new_obj);
    let new_obj2 = await this.db.get(NODES, id);
    return {
      success: true,
      data: [new_obj2],
    };
  }

  async get_attachment(
    object_id: JDObjectUUID,
    name: string,
  ): Promise<JDResult> {
    let prev_obj_ret = await this.get_object(object_id);
    if (!prev_obj_ret.data[0].atts[name]) {
      return {
        success: false,
        data: [],
      };
    }
    let att_info: JDAttachment = prev_obj_ret.data[0].atts[name];
    // p("att id is",att_info)
    let arr = await this.db.getAllFromIndex(
      ATTACHMENTS,
      BY_UUID,
      att_info.uuid,
    );
    // p("att is",arr)
    return {
      success: true,
      data: arr,
    };
  }

  async get_attachment_data(att_id: JDObjectUUID): Promise<JDResult> {
    // p("att id is",att_id)
    let arr = await this.db.getAllFromIndex(ATTACHMENTS, BY_UUID, att_id);
    // p("att is",arr)
    return {
      success: true,
      data: arr[0].blob,
    };
  }

  async remove_attachment(
    object_id: JDObjectUUID,
    name: string,
  ): Promise<JDResult> {
    let prev_obj_ret = await this.get_object(object_id);
    let prev_obj = prev_obj_ret.data[0];
    let new_obj = JSON.parse(JSON.stringify(prev_obj));
    new_obj.version = prev_obj.version + 1;
    delete new_obj.atts[name];
    delete new_obj.dbid;
    let id = await this.db.add(NODES, new_obj);
    let new_obj2 = await this.db.get(NODES, id);
    return {
      success: true,
      data: [new_obj2],
    };
  }

  delete_object(object_id: JDObjectUUID): Promise<JDResult> {
    return Promise.resolve(undefined);
  }

  async get_object(object_id: JDObjectUUID): Promise<JDResult> {
    let arr = await this.db.getAllFromIndex(NODES, BY_UUID, object_id);
    let fin = arr.reduce((a, b) => (b.version > a.version ? b : a));
    return {
      success: true,
      data: [fin],
    };
  }

  async get_object_by_version(
    object_id: JDObjectUUID,
    version: number,
  ): Promise<JDResult> {
    let arr = await this.db.getAllFromIndex(NODES, BY_UUID, object_id);
    let a = arr.find((a) => a.version === version);
    return {
      success: true,
      data: [a],
    };
  }
  async get_object_versions(object_id: JDObjectUUID): Promise<JDResult> {
    let arr = await this.db.getAllFromIndex(NODES, BY_UUID, object_id);
    return {
      success: true,
      data: arr,
    };
  }

  async new_attachment(props: JDProps, opaque: any): Promise<JDResult> {
    let buff = opaque as [];
    let att: JDAttachment = {
      uuid: gen_id("attachment"),
      // @ts-ignore
      mime: detect_mime(buff, opaque, props.mime),
      props: {},
      size: opaque.length,
    };
    if (props)
      Object.keys(props).forEach((name) => {
        att.props[name] = props[name];
      });
    // @ts-ignore
    att.blob = buff;
    let id = await this.db.add(ATTACHMENTS, att);
    let new_att = await this.db.get(ATTACHMENTS, id);
    return {
      success: true,
      data: [new_att],
    };
  }

  async new_object(props?: JDProps): Promise<JDResult> {
    let obj = { uuid: gen_id("node"), version: 0, props: props, atts: {} };
    let id = await this.db.add(NODES, obj);
    let new_obj = await this.db.get(NODES, id);
    return {
      success: true,
      data: [new_obj],
    };
  }

  async update_object_props(
    object_id: JDObjectUUID,
    props?: JDProps,
  ): Promise<JDResult> {
    let prev_obj_ret = await this.get_object(object_id);
    let prev_obj = prev_obj_ret.data[0];
    let new_obj = JSON.parse(JSON.stringify(prev_obj));
    if (props) {
      Object.keys(props).forEach((name) => {
        new_obj.props[name] = props[name];
      });
    }
    new_obj.version = prev_obj.version + 1;
    delete new_obj.dbid;
    let id = await this.db.add(NODES, new_obj);
    let new_obj2 = await this.db.get(NODES, id);
    return {
      success: true,
      data: [new_obj2],
    };
  }

  version_object(source_id: JDObjectUUID, props?: JDProps): Promise<JDResult> {
    return Promise.resolve(undefined);
  }

  async get_all_objects(): Promise<JDResult> {
    let result = await this.db.getAll(NODES);
    return {
      success: true,
      data: result,
    };
  }

  async search(query: JDQuery): Promise<JDResult> {
    let res: JDResult = {
      success: true,
      data: [],
    };
    let result = await this.db.getAll(NODES);
    console.log("result is", result);
    for (let obj of result) {
      let obb: JDObject = obj;
      if (match_query(obb, query)) {
        res.data.push(obb);
      }
    }
    return res;
  }
}
