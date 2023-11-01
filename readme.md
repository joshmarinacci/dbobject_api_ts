# query design

support ANDs and ORs
support querying multiple properties
string property equals vs substring
number property equals vs near
dates before and after and equals
array equals vs contains vs contains substring
object property sub-property
booleans?
enums?

```json
[
  { "prop": "name", "value": "bob", "comparison": "equals" },
  ["name", "=", "bob"],
  { "operation": "or", "clauses": [] },
  { "operation": "and", "clauses": [] },

  {
    "and": [
      { "prop": "name", "op": "equals", "value": "bob" },
      { "name": { "equals": "value" } }
    ]
  }
]
```

find all documents when type is bookmark and the contents contains the string "javascript"

```json
{
  "and": [
    { "prop": "type", "op": "equals", "value": "bookmark" },
    {
      "prop": "contents",
      "op": "substring",
      "value": "javascript",
      "options": { "caseinsensitive": true }
    }
  ]
}
```

## projection / pick

Ignore for now. You always get the first object.
Get vs get with attachments blobs?
