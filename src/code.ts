// ─── ID do arquivo da biblioteca (extraído da URL do Figma) ──────────────────
// Formato da URL: figma.com/file/XXXXXXXXXXXXXX/nome-do-arquivo
// Substitua pela ID real do seu arquivo de biblioteca.

const LIBRARY_FILE_KEY = "COLE_AQUI_O_ID_DA_BIBLIOTECA"

const STYLE_NAMES = {
  PAGE:        "Página Inicial",

  LAYER_1:     "Primeira camada",
  LAYER_2:     "Segunda camada",
  LAYER_3:     "Terceira camada",
  LAYER_4:     "Quarta camada",
  LAYER_5:     "Quinta camada",
  LAYER_6:     "Sexta camada",

  UPDATE:      "Atualizações Recentes",
  NEW:         "Novas jornadas",
  ARCHIVED:    "Jornadas arquivadas",
  IN_PROGRESS: "Jornada em andamento",

  ICONS:       "Icones",
  SYSTEM:      "Sistema",
  COMPONENTS:  "Componentes",
}

// ─── Sections com nome exato que recebem a cor de Página Inicial ──────────────

const PAGE_SECTION_NAMES = ["1 - Login", "2 - Home"]

// ─── Mapeamento de profundidade → style ───────────────────────────────────────

const DEPTH_STYLE_NAMES = [
  STYLE_NAMES.LAYER_1,
  STYLE_NAMES.LAYER_2,
  STYLE_NAMES.LAYER_3,
  STYLE_NAMES.LAYER_4,
  STYLE_NAMES.LAYER_5,
  STYLE_NAMES.LAYER_6, // fallback para profundidade 6+
]

// ─── Styles que o plugin nunca deve alterar ───────────────────────────────────

const IMMUTABLE_STYLE_NAMES = [
  STYLE_NAMES.ICONS,
  STYLE_NAMES.SYSTEM,
  STYLE_NAMES.COMPONENTS,
]

const STORAGE_KEY = "styleKeyMap"

// ─── Abre a UI ────────────────────────────────────────────────────────────────

figma.showUI(__html__, { width: 280, height: 620, title: "Section Color Reset", themeColors: true })

// ─── Helpers de comunicação com a UI ─────────────────────────────────────────

function sendSetupDone(success: boolean, text: string, detail?: string, styleNames?: string[]) {
  figma.ui.postMessage({ type: "setup-done", success, text, detail, styleNames })
}

function sendResetDone(
  success: boolean,
  text: string,
  stats?: { updated: number; ignored: number; skipped: number },
  detail?: string
) {
  figma.ui.postMessage({ type: "reset-done", success, text, stats, detail })
}

// ─── SETUP: salva keys dos styles locais ──────────────────────────────────────
// Rode no arquivo da BIBLIOTECA onde os styles foram criados.

async function saveStyleKeys(): Promise<void> {
  const styles = await figma.getLocalPaintStylesAsync()

  if (styles.length === 0) {
    sendSetupDone(false, "Nenhum style local encontrado.", "Abra o arquivo da biblioteca e rode o setup novamente.")
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

  if (Object.keys(keyMap).length === 0) {
    sendSetupDone(false, "Nenhum style mapeado.", "Verifique se os nomes dos styles batem com o esperado.")
    return
  }

  await figma.clientStorage.setAsync(STORAGE_KEY, keyMap)

  const total = Object.keys(keyMap).length
  const expectedCount = Object.keys(STYLE_NAMES).length
  const detail = missing.length > 0 ? `Não encontrados: ${missing.join(", ")}` : undefined

  sendSetupDone(
    missing.length === 0,
    `${total} de ${expectedCount} styles salvos com sucesso.`,
    detail,
    Object.keys(keyMap)
  )

  figma.notify(`✅ Setup: ${total} de ${expectedCount} styles salvos.`)
}

// ─── Carrega styles via keys salvas (suporta team library) ────────────────────

async function loadStylesFromKeys(): Promise<Record<string, BaseStyle>> {
  const keyMap: Record<string, string> | null =
    await figma.clientStorage.getAsync(STORAGE_KEY)

  if (!keyMap || Object.keys(keyMap).length === 0) return {}

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

// ─── Fallback: auto-descoberta via fills já aplicados ─────────────────────────

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

// ─── Regra: nome exato → Página Inicial ───────────────────────────────────────

function isPageSection(section: SectionNode): boolean {
  const trimmed = section.name.trim()
  return PAGE_SECTION_NAMES.includes(trimmed)
}

// ─── Resolução de style esperado ─────────────────────────────────────────────

function resolveExpectedStyle(
  section: SectionNode,
  styleMap: Record<string, BaseStyle>
): BaseStyle | null {
  if (isPageSection(section)) {
    return styleMap[STYLE_NAMES.PAGE] ?? null
  }

  const depth = getSectionDepth(section)
  const index = Math.min(depth - 1, DEPTH_STYLE_NAMES.length - 1)
  return styleMap[DEPTH_STYLE_NAMES[index]] ?? null
}

// ─── Verificação de imutabilidade ─────────────────────────────────────────────

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

// ─── Nota sobre strokes ───────────────────────────────────────────────────────
// A API do Figma não expõe a propriedade "strokes" para SectionNode.
// Isso é uma limitação conhecida da API — não é possível remover strokes
// de sections via plugin até que o Figma implemente esse suporte.

// ─── RESET: aplica os styles corretos nas sections ────────────────────────────

async function resetSectionColors(): Promise<void> {
  if (figma.fileKey === LIBRARY_FILE_KEY) {
    sendResetDone(
      false,
      "Reset bloqueado na biblioteca.",
      undefined,
      "O reset não pode ser executado no arquivo da biblioteca. Abra um arquivo de projeto."
    )
    figma.notify("⛔ Reset bloqueado — abra um arquivo de projeto.", { error: true })
    return
  }

  const styleMap = await getStyleMap()

  if (Object.keys(styleMap).length === 0) {
    sendResetDone(
      false,
      "Nenhum style encontrado.",
      undefined,
      "Rode o Setup no arquivo da biblioteca primeiro."
    )
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

    if (isImmutable(section, styleMap)) {
      ignored++
      continue
    }

    const expected = resolveExpectedStyle(section, styleMap)

    if (!expected) {
      skipped++
      continue
    }

    if (section.fillStyleId !== expected.id) {
      await section.setFillStyleIdAsync(expected.id)
      updated++
      console.log(`✅ "${section.name}" → "${expected.name}"`)
    }
  }

  const stats = { updated, ignored, skipped }
  const detail = missing.length > 0
    ? `Styles não encontrados: ${missing.join(", ")}`
    : undefined

  sendResetDone(
    true,
    `${updated} atualizadas · ${ignored} ignoradas · ${skipped} sem style`,
    stats,
    detail
  )

  figma.notify(`✅ ${updated} atualizadas | 🔒 ${ignored} ignoradas`)
}

// ─── Recebe mensagens da UI ───────────────────────────────────────────────────

figma.ui.onmessage = async (msg: { type: string; height?: number }) => {
  try {
    if (msg.type === "check-setup") {
      //await figma.clientStorage.deleteAsync(STORAGE_KEY)  //🔴 UTILIZAR PARA RESETAR O SETUP DE CORES
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
    } else if (msg.type === "reset") {
      await resetSectionColors()
    }
  } catch (error) {
    console.error(error)
    figma.ui.postMessage({
      type: msg.type === "setup" ? "setup-done" : "reset-done",
      success: false,
      text: "Erro inesperado. Veja o console para detalhes."
    })
    figma.notify("❌ Erro ao executar plugin", { error: true })
  }
}