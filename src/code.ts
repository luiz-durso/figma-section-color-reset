import { STORAGE_KEY } from "./constants"
import { saveStyleKeys } from "./setup"
import { resetSectionColors } from "./reset"

// ─── Abre a UI ────────────────────────────────────────────────────────────────

figma.showUI(__html__, {
  width: 280,
  height: 620,
  title: "Section Color Reset",
  themeColors: true,
})

// ─── Recebe mensagens da UI ───────────────────────────────────────────────────

figma.ui.onmessage = async (msg: { type: string; height?: number }) => {
  try {

    if (msg.type === "check-setup") {
      //await figma.clientStorage.deleteAsync(STORAGE_KEY) // 🔴 Aplicar para resetar o setup
      const keyMap = await figma.clientStorage.getAsync(STORAGE_KEY)
      const done = keyMap && Object.keys(keyMap).length > 0
      figma.ui.postMessage({ type: "setup-status", done: !!done })
      return
    }

    if (msg.type === "resize" && msg.height) {
      figma.ui.resize(280, Math.min(Math.max(msg.height, 300), 900))
      return
    }

    if (msg.type === "setup") {
      await saveStyleKeys()
      return
    }

    if (msg.type === "reset") {
      await resetSectionColors()
      return
    }

  } catch (error) {
    console.error(error)
    figma.ui.postMessage({
      type: msg.type === "setup" ? "setup-done" : "reset-done",
      success: false,
      text: "Erro inesperado. Veja o console para detalhes.",
    })
    figma.notify("❌ Erro ao executar plugin", { error: true })
  }
}