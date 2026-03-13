import { LIBRARY_FILE_KEY } from "./constants";
import { getStyleMap } from "./styles";
import { getSections, isImmutable, resolveExpectedStyle } from "./utils";
// ─── Envia resultado do reset para a UI ──────────────────────────────────────
export function sendResetDone(success, text, stats, detail) {
    figma.ui.postMessage({ type: "reset-done", success, text, stats, detail });
}
function sendProgress(pct, label) {
    figma.ui.postMessage({ type: "progress", context: "reset", pct: Math.round(pct), label });
}
// ─── Aplica os styles corretos em todas as sections da página ─────────────────
// Nota: A API do Figma não expõe "strokes" para SectionNode —
// não é possível remover strokes de sections até que o Figma implemente esse suporte.
export async function resetSectionColors() {
    // Bloqueia reset no arquivo da biblioteca
    if (figma.fileKey === LIBRARY_FILE_KEY) {
        sendResetDone(false, "Reset bloqueado na biblioteca.", undefined, "O reset não pode ser executado no arquivo da biblioteca. Abra um arquivo de projeto.");
        figma.notify("⛔ Reset bloqueado — abra um arquivo de projeto.", { error: true });
        return;
    }
    const styleMap = await getStyleMap();
    const totalLayers = Object.keys(styleMap.layers).length;
    if (!styleMap.page && totalLayers === 0) {
        sendResetDone(false, "Nenhum style encontrado.", undefined, "Rode o Setup no arquivo da biblioteca primeiro.");
        figma.notify("❌ Rode o Setup na biblioteca primeiro.", { error: true });
        return;
    }
    const sections = getSections();
    const total = sections.length;
    console.log(`Total de sections: ${total} | Camadas disponíveis: ${Object.keys(styleMap.layers).length}`);
    let updated = 0, ignored = 0, skipped = 0;
    for (let i = 0; i < total; i++) {
        const section = sections[i];
        const pct = Math.round(((i + 1) / total) * 100);
        sendProgress(pct, `"${section.name}"`);
        await new Promise(resolve => setTimeout(resolve, 0)); // libera a thread para UI atualizar
        if (isImmutable(section, styleMap)) {
            ignored++;
            continue;
        }
        const expected = resolveExpectedStyle(section, styleMap);
        if (!expected) {
            skipped++;
            continue;
        }
        if (section.fillStyleId !== expected.id) {
            await section.setFillStyleIdAsync(expected.id);
            updated++;
            console.log(`✅ "${section.name}" → "${expected.name}"`);
        }
    }
    const stats = { updated, ignored, skipped };
    sendResetDone(true, `${updated} atualizadas · ${ignored} ignoradas · ${skipped} sem style`, stats);
    figma.notify(`✅ ${updated} atualizadas | 🔒 ${ignored} ignoradas`);
}
