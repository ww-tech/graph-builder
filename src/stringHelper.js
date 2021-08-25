export function escapeQuotes(str) {
  if (!str) return str;
  return str.replace(/'/g, "\\'")
}

export function quote(value) {
  if (typeof(value) === 'string')
    return `'${escapeQuotes(value)}'`;
  return value;
}

export function stringifyProperties(data) {
  const stringified = Object.keys(data).map(field => {
    if (typeof data[field] === 'number') return `${field}: ${data[field]}`
    else if (typeof data[field] === 'string') return `${field}: '${escapeQuotes(data[field])}'`
    else if (typeof data[field] === 'object') return `${field}: '${escapeQuotes(JSON.stringify(data[field]))}'`
  }).join(', ')
  return `{${stringified}}`
}

export const setPropertiesString = (varName, data) => {
  const str = Object.keys(data).map(field => {
    if (typeof data[field] === 'number') return `${varName}.${field} = ${data[field]}`
    else if (typeof data[field] === 'string') return `${varName}.${field} = '${escapeQuotes(data[field])}'`
    else if (typeof data[field] === 'object') return `${varName}.${field} = '${escapeQuotes(JSON.stringify(data[field]))}'`
  }).join(', ')
  return `SET ${str}`
}
