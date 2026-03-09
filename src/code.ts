// ─── MODO DE OPERAÇÃO ─────────────────────────────────────────────────────────
//
//  "debug"  → Lista TODOS os styles locais no console com nome e key.
//             Rode no arquivo da BIBLIOTECA para ver os nomes exatos.
//
//  "setup"  → Salva os keys dos styles no clientStorage.
//             Rode no arquivo da BIBLIOTECA após confirmar os nomes no debug.
//
//  "reset"  → Aplica os styles corretos nas sections.
//             Rode no arquivo do PROJETO.
//
// ⚠️ Troque o valor abaixo antes de compilar com: npm run build

type Mode = "debug" | "setup" | "reset"
const MODE: Mode = "reset" // ← troque aqui: "debug" | "setup" | "reset"

// ─── Nomes dos styles esperados ───────────────────────────────────────────────
// Esses nomes precisam bater EXATAMENTE com os nomes no Figma (parte após "/").
// Rode em modo "debug" na biblioteca para confirmar os nomes reais.

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

const STORAGE_KEY = "styleKeyMap"

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
  STYLE_NAMES.LAYER_5, // fallback para profundidade 5+
]

// ─── Styles que o plugin nunca deve alterar ───────────────────────────────────

const IMMUTABLE_STYLE_NAMES = [
  STYLE_NAMES.ICONS,
  STYLE_NAMES.SYSTEM,
  STYLE_NAMES.COMPONENTS,
]

// ─── DEBUG: lista todos os styles locais do arquivo ───────────────────────────

async function debugStyles(): Promise<void> {
  const styles = await figma.getLocalPaintStylesAsync()

  console.log("===========================================")
  console.log(`TOTAL DE STYLES LOCAIS: ${styles.length}`)
  console.log("===========================================")

  for (const style of styles) {
    console.log(`Nome : "${style.name}"`)
    console.log(`Key  : ${style.key}`)
    console.log("-------------------------------------------")
  }

  if (styles.length === 0) {
    figma.notify("⚠️ Nenhum style local encontrado. Confirme que está no arquivo da biblioteca.", { error: true })
  } else {
    figma.notify(`🔍 ${styles.length} styles encontrados. Abra o console para ver os nomes.`)
  }
}

// ─── SETUP: salva os keys dos styles no clientStorage ─────────────────────────

async function saveStyleKeys(): Promise<void> {
  const styles = await figma.getLocalPaintStylesAsync()
  const keyMap: Record<string, string> = {}

  console.log(`Total de styles locais: ${styles.length}`)
  console.log("Lista completa:")
  for (const s of styles) {
    console.log(`  → "${s.name}"`)
  }

  for (const style of styles) {
    // Compara apenas a parte após a última "/" (ignora nome da pasta)
    const parts = style.name.split("/")
    const lastName = parts[parts.length - 1].trim()

    for (const [key, expected] of Object.entries(STYLE_NAMES)) {
      if (lastName.toLowerCase() === expected.toLowerCase()) {
        keyMap[expected] = style.key
        console.log(`✅ [${key}] "${expected}" → key: ${style.key}`)
      }
    }
  }

  const missing = Object.values(STYLE_NAMES).filter((n) => !keyMap[n])
  if (missing.length > 0) {
    console.warn("⚠️ Styles NÃO encontrados:")
    missing.forEach((n) => console.warn(`  ✗ "${n}"`))
  }

  if (Object.keys(keyMap).length === 0) {
    figma.notify("⚠️ Nenhum style mapeado. Rode modo debug para ver os nomes.", { error: true })
    return
  }

  await figma.clientStorage.setAsync(STORAGE_KEY, keyMap)

  const total = Object.keys(keyMap).length
  const expectedCount = Object.keys(STYLE_NAMES).length
  console.log(`Keys salvas: ${total} de ${expectedCount}`)
  figma.notify(`✅ ${total} de ${expectedCount} keys salvos!`)
}

// ─── Carrega styles via keys salvas (suporta team library) ────────────────────

async function loadStylesFromKeys(): Promise<Record<string, BaseStyle>> {
  const keyMap: Record<string, string> | null =
    await figma.clientStorage.getAsync(STORAGE_KEY)

  if (!keyMap || Object.keys(keyMap).length === 0) {
    console.warn("clientStorage vazio — rode o setup na biblioteca primeiro.")
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

// ─── Fallback: styles locais do arquivo atual ─────────────────────────────────

async function loadLocalStyles(): Promise<Record<string, BaseStyle>> {
  const styles = await figma.getLocalPaintStylesAsync()
  const styleMap: Record<string, BaseStyle> = {}

  for (const style of styles) {
    const parts = style.name.split("/")
    const lastName = parts[parts.length - 1].trim()

    for (const [, expected] of Object.entries(STYLE_NAMES)) {
      if (lastName.toLowerCase() === expected.toLowerCase()) {
        styleMap[expected] = style
      }
    }
  }

  return styleMap
}

async function getStyleMap(): Promise<Record<string, BaseStyle>> {
  const fromKeys = await loadStylesFromKeys()
  if (Object.keys(fromKeys).length > 0) return fromKeys

  console.warn("Nenhuma key salva. Tentando styles locais como fallback...")
  return await loadLocalStyles()
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
    figma.notify("❌ Nenhum style encontrado. Rode o setup na biblioteca primeiro.", {
      error: true, timeout: 6000
    })
    return
  }

  const missing = Object.values(STYLE_NAMES).filter((n) => !styleMap[n])
  if (missing.length > 0) {
    console.warn("⚠️ Styles não encontrados:", missing.join(", "))
    figma.notify(`⚠️ Styles não encontrados: ${missing.join(", ")}`, {
      error: true, timeout: 5000
    })
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
    }
  }

  console.log(`Atualizadas: ${updated} | Ignoradas: ${ignored} | Sem style: ${skipped}`)
  figma.notify(`✅ ${updated} atualizadas | 🔒 ${ignored} ignoradas | ⚠️ ${skipped} sem style`)
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function run(): Promise<void> {
  try {
    if (MODE === "debug") {
      await debugStyles()
    } else if (MODE === "setup") {
      await saveStyleKeys()
    } else {
      await resetSectionColors()
    }
  } catch (error) {
    console.error(error)
    figma.notify("❌ Erro ao executar plugin", { error: true })
  }

  figma.closePlugin()
}

run()