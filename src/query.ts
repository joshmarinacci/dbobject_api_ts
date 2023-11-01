import { JDClause, JDObject, JDQuery } from "./index";

export function match_query(obj: JDObject, query: JDQuery): boolean {
  let passed = true;
  query.and.forEach((cla: JDClause) => {
    if (!match_clause(obj, cla)) {
      passed = false;
    }
  });
  return passed;
}
export function match_clause(obj: JDObject, cla: JDClause): boolean {
  if (!obj.props.hasOwnProperty(cla.prop)) return false;
  let prop = obj.props[cla.prop];
  if (cla.op === "equals") {
    return prop === cla.value;
  }
  if (cla.op === "substring") {
    if (cla.options && cla.options.caseinsensitive === true) {
      return prop.toLowerCase().includes(cla.value.toLowerCase());
    }
    return prop.includes(cla.value);
  }
  console.log("shouldn't be here");
  throw new Error("shdnt be here");
}
