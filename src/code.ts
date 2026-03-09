// ─── Nomes esperados dos styles (parte após a última "/") ─────────────────────

const STYLE_NAMES = {
  PAGE:        "Página Inicial",

  LAYER_1:     "Primeira camada",
  LAYER_2:     "Segunda camada",
  LAYER_3:     "Terceira camada",
  LAYER_4:     "Quarta camada",
  LAYER_5:     "Quinta camada",

  UPDATE:      "Atualizações Recentes",
  NEW:         "Novas jornadas",
  ARCHIVED:    "Jornadas arquivadas",
  IN_PROGRESS: "Jornada em andamento",

  ICONS:       "Icones",
  SYSTEM:      "Sistema",
  COMPONENTS:  "Componentes",
}

// ─── Mapeamento de prefixo de nome → style ────────────────────────────────────

const PREFIX_STYLE_MAP: Array<{ prefix: string; styleName: string }> = [
  { prefix: "1-login", styleName: STYLE_NAMES.PAGE },
  { prefix: "2-home",  styleName: STYLE_NAMES.PAGE },
]

// ─── Mapeamento de profundidade → style ───────────────────────────────────────

const DEPTH_STYLE_NAMES = [
  STYLE_NAMES.LAYER_1,
  STYLE_NAMES.LAYER_2,
  STYLE_NAMES.LAYER_3,
  STYLE_NAMES.LAYER_4,
  STYLE_NAMES.LAYER_5,
]

// ─── Styles que o plugin nunca deve alterar ───────────────────────────────────

const IMMUTABLE_STYLE_NAMES = [
  STYLE_NAMES.ICONS,
  STYLE_NAMES.SYSTEM,
  STYLE_NAMES.COMPONENTS,
]

const STORAGE_KEY = "styleKeyMap"

// ─── Abre a UI ────────────────────────────────────────────────────────────────

figma.showUI(__html__, { width: 240, height: 260, title: "Section Color Reset" })

// ─── Helpers de comunicação com a UI ─────────────────────────────────────────

function sendSuccess(text: string) {
  figma.ui.postMessage({ type: "success", text })
}

function sendError(text: string) {
  figma.ui.postMessage({ type: "error", text })
}

function sendInfo(text: string) {
  figma.ui.postMessage({ type: "info", text })
}

// ─── SETUP: salva keys dos styles locais ──────────────────────────────────────
// Rode no arquivo da BIBLIOTECA onde os styles foram criados.

async function saveStyleKeys(): Promise<void> {
  const styles = await figma.getLocalPaintStylesAsync()

  if (styles.length === 0) {
    sendError("Nenhum style local encontrado. Abra o arquivo da biblioteca.")
    return
  }

  const keyMap: Record<string, string> = {}

  for (const style of styles) {
    const parts = style.name.split("/")
    const lastName = parts[parts.length - 1].trim()

    for (const [key, expected] of Object.entries(STYLE_NAMES)) {
      if (lastName.toLowerCase() === expected.toLowerCase()) {
        keyMap[expected] = style.key
        console.log(`✅ [${key}] "${expected}" → ${style.key}`)
      }
    }
  }

  const missing = Object.values(STYLE_NAMES).filter((n) => !keyMap[n])
  if (missing.length > 0) {
    console.warn("⚠️ Não encontrados:", missing.join(", "))
  }

  if (Object.keys(keyMap).length === 0) {
    sendError("Nenhum style mapeado. Verifique os nomes na biblioteca.")
    return
  }

  await figma.clientStorage.setAsync(STORAGE_KEY, keyMap)

  const total = Object.keys(keyMap).length
  const expectedCount = Object.keys(STYLE_NAMES).length
  const missingCount = missing.length

  const msg = missingCount > 0
    ? `${total} de ${expectedCount} keys salvos. Faltaram: ${missing.join(", ")}`
    : `${total} de ${expectedCount} keys salvos com sucesso!`

  console.log(msg)
  sendSuccess(msg)
  figma.notify(`✅ Setup concluído: ${total} de ${expectedCount} styles salvos.`)
}

// ─── Carrega styles via keys salvas (suporta team library) ────────────────────

async function loadStylesFromKeys(): Promise<Record<string, BaseStyle>> {
  const keyMap: Record<string, string> | null =
    await figma.clientStorage.getAsync(STORAGE_KEY)

  if (!keyMap || Object.keys(keyMap).length === 0) {
    return {}
  }

  const styleMap: Record<string, BaseStyle> = {}

  for (const [styleName, key] of Object.entries(keyMap)) {
    try {
      const style = await figma.importStyleByKeyAsync(key)
      if (style) {
        styleMap[styleName] = style
        console.log(`✅ Importado: "${styleName}"`)
      }
    } catch {
      console.warn(`⚠️ Falha ao importar "${styleName}" (key: ${key})`)
    }
  }

  return styleMap
}

// ─── Fallback: styles já aplicados nas sections ───────────────────────────────

async function discoverStylesFromFile(): Promise<Record<string, BaseStyle>> {
  const styleMap: Record<string, BaseStyle> = {}
  const seenIds = new Set<string>()

  for (const page of figma.root.children) {
    await page.loadAsync()
    const sections = page.findAll((n) => n.type === "SECTION") as SectionNode[]

    for (const section of sections) {
      const fillStyleId = section.fillStyleId
      if (typeof fillStyleId !== "string" || seenIds.has(fillStyleId)) continue
      seenIds.add(fillStyleId)

      try {
        const style = await figma.getStyleByIdAsync(fillStyleId)
        if (!style) continue

        const parts = style.name.split("/")
        const lastName = parts[parts.length - 1].trim()

        for (const [, expected] of Object.entries(STYLE_NAMES)) {
          if (lastName.toLowerCase() === expected.toLowerCase()) {
            styleMap[expected] = style
          }
        }
      } catch {
        // ignorar
      }
    }
  }

  return styleMap
}

// ─── Carrega styles (keys salvas → fallback auto-descoberta) ──────────────────

async function getStyleMap(): Promise<Record<string, BaseStyle>> {
  const fromKeys = await loadStylesFromKeys()
  if (Object.keys(fromKeys).length > 0) return fromKeys

  console.warn("Nenhuma key salva. Tentando auto-descoberta...")
  return await discoverStylesFromFile()
}

// ─── Utilitários de seção ─────────────────────────────────────────────────────

function getSections(): SectionNode[] {
  const selected = figma.currentPage.selection.filter(
    (n) => n.type === "SECTION"
  ) as SectionNode[]
  if (selected.length > 0) return selected
  return figma.currentPage.findAll((n) => n.type === "SECTION") as SectionNode[]
}

function getSectionDepth(section: SectionNode): number {
  let depth = 1
  let parent = section.parent
  while (parent) {
    if (parent.type === "SECTION") depth++
    parent = parent.parent
  }
  return depth
}

function resolveExpectedStyle(
  section: SectionNode,
  styleMap: Record<string, BaseStyle>
): BaseStyle | null {
  const name = section.name.trim().toLowerCase()
  const prefixRule = PREFIX_STYLE_MAP.find((r) => name.startsWith(r.prefix))
  if (prefixRule) return styleMap[prefixRule.styleName] ?? null

  const depth = getSectionDepth(section)
  const index = Math.min(depth - 1, DEPTH_STYLE_NAMES.length - 1)
  return styleMap[DEPTH_STYLE_NAMES[index]] ?? null
}

function isImmutable(
  section: SectionNode,
  styleMap: Record<string, BaseStyle>
): boolean {
  const fillStyleId = section.fillStyleId
  if (typeof fillStyleId !== "string") return false

  const immutableIds = IMMUTABLE_STYLE_NAMES
    .map((name) => styleMap[name]?.id)
    .filter((id): id is string => Boolean(id))

  return immutableIds.includes(fillStyleId)
}

// ─── RESET: aplica os styles corretos nas sections ────────────────────────────

async function resetSectionColors(): Promise<void> {
  const styleMap = await getStyleMap()

  if (Object.keys(styleMap).length === 0) {
    sendError("Nenhum style encontrado. Rode o Setup na biblioteca primeiro.")
    figma.notify("❌ Rode o Setup na biblioteca primeiro.", { error: true })
    return
  }

  const missing = Object.values(STYLE_NAMES).filter((n) => !styleMap[n])
  if (missing.length > 0) {
    console.warn("⚠️ Styles não encontrados:", missing.join(", "))
  }

  const sections = getSections()
  console.log("Total de sections:", sections.length)

  let updated = 0, ignored = 0, skipped = 0

  for (const section of sections) {
    if (isImmutable(section, styleMap)) { ignored++; continue }

    const expected = resolveExpectedStyle(section, styleMap)
    if (!expected) { skipped++; continue }

    if (section.fillStyleId !== expected.id) {
      await section.setFillStyleIdAsync(expected.id)
      updated++
      console.log(`✅ "${section.name}" → "${expected.name}"`)
    }
  }

  const resultMsg = `${updated} atualizadas | ${ignored} ignoradas | ${skipped} sem style`
  console.log(resultMsg)
  sendSuccess(resultMsg)
  figma.notify(`✅ ${resultMsg}`)
}

// ─── Recebe mensagens da UI ───────────────────────────────────────────────────

figma.ui.onmessage = async (msg: { type: string }) => {
  try {
    if (msg.type === "setup") {
      await saveStyleKeys()
    } else if (msg.type === "reset") {
      await resetSectionColors()
    }
  } catch (error) {
    console.error(error)
    sendError("Erro inesperado. Veja o console.")
    figma.notify("❌ Erro ao executar plugin", { error: true })
  }
}