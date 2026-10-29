// QA harness: loads the real js/gallery.js with its data/upload dependencies
// stubbed, so folder navigation can be exercised without a Firebase backend.
const files = {
  "./js/gallery.js": "./js/gallery.js",
  "./utils.js": "./js/utils.js",
  "./firestore.js": "./__qa-firestore-stub.js",
  "../src/services/telegramService.js": "./__qa-telegram-stub.js"
};

export async function loadGallery() {
  const sources = new Map();
  await Promise.all(Object.entries(files).map(async ([spec, path]) => {
    sources.set(spec, await (await fetch(path)).text());
  }));
  const built = new Map();
  const build = async spec => {
    if (built.has(spec)) return built.get(spec);
    const deps = [...sources.get(spec).matchAll(/from\s+"([^"]+)"/g)].map(m => m[1]);
    const urls = await Promise.all(deps.map(dep => build(files[dep] ? dep : dep)));
    let index = 0;
    const code = sources.get(spec).replace(/from\s+"([^"]+)"/g, () => `from "${urls[index++]}"`);
    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    built.set(spec, url);
    return url;
  };
  return import(await build("./js/gallery.js"));
}
