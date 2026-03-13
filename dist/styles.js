import { STORAGE_KEY, PAGE_STYLE_NAME, FOLDER_IMMUTABLE } from "./constants";
// ─── Carrega styles via keys salvas (suporta team library) ────────────────────
export async function loadStylesFromKeys() {
    const keyMap = await figma.clientStorage.getAsync(STORAGE_KEY);
    if (!keyMap)
        return null;
    const result = { page: null, layers: {}, states: {}, immutable: {} };
    // Página Inicial
    if (keyMap.page) {
        try {
            result.page = await figma.importStyleByKeyAsync(keyMap.page);
        }
        catch (_a) {
            console.warn("⚠️ Falha ao importar Página Inicial");
        }
    }
    // Camadas
    for (const [depthStr, key] of Object.entries(keyMap.layers)) {
        try {
            const style = await figma.importStyleByKeyAsync(key);
            if (style)
                result.layers[Number(depthStr)] = style;
        }
        catch (_b) {
            console.warn(`⚠️ Falha ao importar camada ${depthStr}`);
        }
    }
    // Estados
    for (const [name, key] of Object.entries(keyMap.states)) {
        try {
            const style = await figma.importStyleByKeyAsync(key);
            if (style)
                result.states[name] = style;
        }
        catch (_c) {
            console.warn(`⚠️ Falha ao importar estado "${name}"`);
        }
    }
    // Imutáveis
    for (const [name, key] of Object.entries(keyMap.immutable)) {
        try {
            const style = await figma.importStyleByKeyAsync(key);
            if (style)
                result.immutable[name] = style;
        }
        catch (_d) {
            console.warn(`⚠️ Falha ao importar imutável "${name}"`);
        }
    }
    return result;
}
// ─── Fallback: descobre styles via fills já aplicados nas sections ────────────
export async function discoverStylesFromFile() {
    var _a, _b, _c, _d;
    const result = { page: null, layers: {}, states: {}, immutable: {} };
    const seenIds = new Set();
    for (const page of figma.root.children) {
        await page.loadAsync();
        const sections = page.findAll((n) => n.type === "SECTION");
        for (const section of sections) {
            const fillStyleId = section.fillStyleId;
            if (typeof fillStyleId !== "string" || seenIds.has(fillStyleId))
                continue;
            seenIds.add(fillStyleId);
            try {
                const style = await figma.getStyleByIdAsync(fillStyleId);
                if (!style)
                    continue;
                const lastName = (_b = (_a = style.name.split("/").pop()) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : "";
                const folder = (_d = (_c = style.name.split("/").slice(-2, -1)[0]) === null || _c === void 0 ? void 0 : _c.trim()) !== null && _d !== void 0 ? _d : "";
                if (lastName.toLowerCase() === PAGE_STYLE_NAME.toLowerCase()) {
                    result.page = style;
                }
                else if (folder === FOLDER_IMMUTABLE) {
                    result.immutable[lastName] = style;
                }
            }
            catch (_e) {
                // ignorar
            }
        }
    }
    return result;
}
// ─── Orquestra: tenta keys primeiro, fallback para descoberta ─────────────────
export async function getStyleMap() {
    const fromKeys = await loadStylesFromKeys();
    if (fromKeys && (fromKeys.page || Object.keys(fromKeys.layers).length > 0)) {
        return fromKeys;
    }
    console.warn("Nenhuma key salva. Tentando auto-descoberta...");
    return await discoverStylesFromFile();
}
