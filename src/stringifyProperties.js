export default function stringifyProperties(data) {
  const stringified = Object.keys(data).map(field => {
    if (typeof data[field] === 'number') return `${field}: ${data[field]}`
    return `${field}: '${escapeQuotes(data[field])}'`
  }).join(', ')
  return `{${stringified}}`
}

function escapeQuotes(str) {
  return str.replace(/'/g, "\\'")
}