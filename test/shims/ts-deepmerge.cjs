function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeTwo(left, right) {
  if (!isPlainObject(left) || !isPlainObject(right)) {
    return right === undefined ? left : right;
  }

  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    result[key] = isPlainObject(value) && isPlainObject(result[key])
      ? mergeTwo(result[key], value)
      : value;
  }
  return result;
}

function merge(...objects) {
  return objects.reduce((acc, item) => mergeTwo(acc, item), {});
}

module.exports = {
  __esModule: true,
  default: merge,
  merge,
};
