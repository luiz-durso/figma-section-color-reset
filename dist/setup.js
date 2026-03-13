import { STORAGE_KEY, PAGE_STYLE_NAME, FOLDER_BASE, FOLDER_IMMUTABLE, FOLDER_STATE, } from "./constants";
// ─── Envia resultado do setup para a UI ──────────────────────────────────────
export function sendSetupDone(success, text, detail) {
    figma.ui.postMessage({ type: "setup-done", success, text, detail });
}
function sendProgress(context, pct, label) {
    figma.ui.postMessage({ type: "progress", context, pct: Math.round(pct), label });
}
// ─── Extrai o número do nome do style de camada ───────────────────────────────
// Aceita qualquer padrão com "camada" e um número: "Camada 1", "Camada 42" etc.
function extractLayerDepth(styleName) {
    const match = styleName.match(/camada\s*(\d+)/i);
    if (!match)
        return null;
    const depth = parseInt(match[1], 10);
    return isNaN(depth) ? null : depth;
}
// ─── Extrai folder e nome do style a partir do nome completo ─────────────────
// Ex: "Paleta - Organização por sessões/Cores Base/Camada 1"
//      → folder = "Cores Base", styleName = "Camada 1"
function parseFolderAndName(fullName) {
    const parts = fullName.split("/");
    const styleName = parts[parts.length - 1].trim();
    const folder = parts.length >= 2 ? parts[parts.length - 2].trim() : "";
    return { folder, styleName };
}
// ─── Salva keys de todos os styles relevantes no clientStorage ────────────────
export async function saveStyleKeys() {
    const styles = await figma.getLocalPaintStylesAsync();
    if (styles.length === 0) {
        sendSetupDone(false, "Nenhum style local encontrado.", "Abra o arquivo da biblioteca e rode o setup novamente.");
        return;
    }
    const keyMap = { page: "", layers: {}, states: {}, immutable: {} };
    const total = styles.length;
    for (let i = 0; i < total; i++) {
        const style = styles[i];
        const { folder, styleName } = parseFolderAndName(style.name);
        const pct = Math.round(((i + 1) / total) * 100);
        sendProgress("setup", pct, `Lendo "${styleName}"...`);
        await new Promise(resolve => setTimeout(resolve, 0)); // libera a thread para UI atualizar
        // ── Cores de Identificação → imutáveis ───────────────────────────────────
        if (folder === FOLDER_IMMUTABLE) {
            keyMap.immutable[styleName] = style.key;
            console.log(`🔒 Imutável: "${styleName}"`);
            continue;
        }
        // ── Cores de Estado → estados (uso futuro) ────────────────────────────────
        if (folder === FOLDER_STATE) {
            keyMap.states[styleName] = style.key;
            console.log(`🎨 Estado: "${styleName}"`);
            continue;
        }
        // ── Cores Base → Página Inicial ou camadas ────────────────────────────────
        if (folder === FOLDER_BASE) {
            if (styleName.toLowerCase() === PAGE_STYLE_NAME.toLowerCase()) {
                keyMap.page = style.key;
                console.log(`🏠 Página Inicial → ${style.key}`);
                continue;
            }
            const depth = extractLayerDepth(styleName);
            if (depth !== null) {
                keyMap.layers[depth] = style.key;
                console.log(`📐 Camada ${depth}: "${styleName}"`);
                continue;
            }
        }
    }
    if (!keyMap.page && Object.keys(keyMap.layers).length === 0) {
        sendSetupDone(false, "Nenhum style mapeado.", "Verifique se os folders e nomes batem com o esperado.");
        return;
    }
    await figma.clientStorage.setAsync(STORAGE_KEY, keyMap);
    const totalLayers = Object.keys(keyMap.layers).length;
    const totalStates = Object.keys(keyMap.states).length;
    const totalImmutable = Object.keys(keyMap.immutable).length;
    sendSetupDone(true, `${totalLayers} camadas · ${totalStates} estados · ${totalImmutable} imutáveis salvos.`);
    figma.notify(`✅ Setup: ${totalLayers} camadas · ${totalStates} estados · ${totalImmutable} imutáveis`);
}
