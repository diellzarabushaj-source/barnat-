(() => {
  'use strict';
  if (window.MedIndexNativeFetch) return;
  Object.defineProperty(window, 'MedIndexNativeFetch', {
    value:window.fetch.bind(window),
    configurable:false,
    enumerable:false,
    writable:false,
  });
})();
