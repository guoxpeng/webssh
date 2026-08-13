// 测试环境存储兜底：Node 26+ 在 globalThis 上暴露实验性 localStorage /
// sessionStorage 访问器（未提供 --localstorage-file 时返回 undefined），
// 会遮蔽 jsdom / happy-dom 注入的存储对象，导致 store 测试里
// localStorage.clear() 报 "Cannot read properties of undefined"。
// 这里检测不到可用实现时补一个内存版，保证任意 Node 版本下测试可跑。
function createMemoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(k) {
      return map.has(String(k)) ? map.get(String(k)) : null;
    },
    setItem(k, v) {
      map.set(String(k), String(v));
    },
    removeItem(k) {
      map.delete(String(k));
    },
    key(i) {
      return [...map.keys()][i] ?? null;
    },
  };
}

for (const name of ['localStorage', 'sessionStorage']) {
  let existing;
  try {
    existing = globalThis[name];
  } catch {
    existing = undefined;
  }
  if (!existing || typeof existing.getItem !== 'function') {
    Object.defineProperty(globalThis, name, {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}
