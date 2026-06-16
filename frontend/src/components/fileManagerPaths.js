export function buildRemotePath(currentPath, itemName) {
  return currentPath === '/' ? `/${itemName}` : `${currentPath}/${itemName}`;
}

export function canCopyRemotePath(item) {
  return Boolean(item?.name);
}
